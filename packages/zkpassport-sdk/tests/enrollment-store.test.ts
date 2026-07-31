import { describe, expect, test } from "bun:test"
import type { EnrollmentBundle } from "@zkpassport/utils"
import {
  createEnrollment,
  deleteEnrollment,
  getEnrollmentId,
  getMaskedName,
  listEnrollments,
  unlockEnrollment,
  type EnrollmentStoreEnvironment,
} from "../src/enrollment/store"
import { ZKPassport } from "../src/index"

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeIDBRequest<T = unknown> {
  onsuccess: (() => void) | null = null
  onerror: (() => void) | null = null
  result!: T
  error: Error | null = null

  succeed(result: T) {
    this.result = result
    queueMicrotask(() => this.onsuccess?.())
  }
}

function createFakeIndexedDB(): { factory: IDBFactory; records: Map<string, unknown> } {
  const records = new Map<string, unknown>()
  const store = {
    put(value: unknown, key: string) {
      const request = new FakeIDBRequest()
      records.set(key, value)
      request.succeed(undefined)
      return request
    },
    get(key: string) {
      const request = new FakeIDBRequest()
      request.succeed(records.get(key))
      return request
    },
    getAllKeys() {
      const request = new FakeIDBRequest()
      request.succeed(Array.from(records.keys()))
      return request
    },
    getAll() {
      const request = new FakeIDBRequest()
      request.succeed(Array.from(records.values()))
      return request
    },
    delete(key: string) {
      const request = new FakeIDBRequest()
      records.delete(key)
      request.succeed(undefined)
      return request
    },
    clear() {
      const request = new FakeIDBRequest()
      records.clear()
      request.succeed(undefined)
      return request
    },
  }
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction: () => ({ objectStore: () => store }),
    close: () => {},
  }
  const factory = {
    open() {
      const request = new FakeIDBRequest() as FakeIDBRequest & {
        onupgradeneeded: (() => void) | null
      }
      request.onupgradeneeded = null
      request.succeed(db)
      return request
    },
  } as unknown as IDBFactory
  return { factory, records }
}

function createFakeCredentials(options: {
  prfSupported: boolean
  prfOnCreate: boolean
}): CredentialsContainer {
  // One PRF output per credential id, like real authenticators
  const prfOutputs = new Map<string, ArrayBuffer>()
  const prfOutputFor = (rawId: ArrayBuffer): ArrayBuffer => {
    const key = Array.from(new Uint8Array(rawId)).join(",")
    if (!prfOutputs.has(key)) {
      prfOutputs.set(key, crypto.getRandomValues(new Uint8Array(32)).buffer)
    }
    return prfOutputs.get(key)!
  }

  const makeCredential = (rawId: ArrayBuffer, includePrfResults: boolean) =>
    ({
      rawId,
      getClientExtensionResults: () => ({
        prf: options.prfSupported
          ? {
              enabled: true,
              ...(includePrfResults ? { results: { first: prfOutputFor(rawId) } } : {}),
            }
          : undefined,
      }),
    }) as unknown as PublicKeyCredential

  return {
    create: async () =>
      makeCredential(
        crypto.getRandomValues(new Uint8Array(16)).buffer,
        options.prfSupported && options.prfOnCreate,
      ),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: async (getOptions: any) =>
      makeCredential(getOptions.publicKey.allowCredentials[0].id, options.prfSupported),
  } as unknown as CredentialsContainer
}

function createEnvironment(options: { prfSupported?: boolean; prfOnCreate?: boolean } = {}): {
  env: EnrollmentStoreEnvironment
  records: Map<string, unknown>
} {
  const { factory, records } = createFakeIndexedDB()
  return {
    env: {
      credentials: createFakeCredentials({
        prfSupported: options.prfSupported ?? true,
        prfOnCreate: options.prfOnCreate ?? true,
      }),
      indexedDB: factory,
      subtle: crypto.subtle,
      getRandomValues: (array) => crypto.getRandomValues(array),
    },
    records,
  }
}

// A realistic TD3 MRZ (88 chars) prefixed by the 5-byte DG1 header
const JOHN_MRZ =
  "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<"
const DG1_HEADER = [0x61, 0x5b, 0x5f, 0x1f, 0x58]

function dg1FromMrz(mrz: string): number[] {
  return [...DG1_HEADER, ...Array.from(new TextEncoder().encode(mrz))]
}

function makeBundle(privateNullifier = "0x1234abcd", mrz = JOHN_MRZ): EnrollmentBundle {
  return {
    version: 1,
    circuitVersion: "0.20.0",
    certificateRegistryRoot: "0x1bcacb112233",
    baseSubproofs: [
      {
        name: "sig_check_dsc_tbs_700_rsa_pkcs_4096_sha256",
        proof: "aa".repeat(64),
        vkeyHash: "0x1",
      },
      {
        name: "sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256",
        proof: "bb".repeat(64),
        vkeyHash: "0x2",
      },
      { name: "data_check_integrity_sa_sha256_dg_sha256", proof: "cc".repeat(64), vkeyHash: "0x3" },
    ],
    witness: {
      dg1: dg1FromMrz(mrz),
      dg2Hash: Array.from({ length: 32 }, (_, i) => (i * 7) % 256),
      expiryDate: "350101",
      privateNullifier,
      salt: "0xdeadbeef",
    },
  }
}

// ---------------------------------------------------------------------------
// Store tests
// ---------------------------------------------------------------------------

describe("enrollment store", () => {
  test("masked name reveals only initials", () => {
    expect(getMaskedName(makeBundle())).toBe("J*** S***")
  })

  test("enrollment id is stable per document", () => {
    expect(getEnrollmentId(makeBundle("0xAABB"))).toBe(getEnrollmentId(makeBundle("0xaabb")))
    expect(getEnrollmentId(makeBundle("0xaabb"))).not.toBe(getEnrollmentId(makeBundle("0xccdd")))
  })

  test("round-trip: create, list, unlock", async () => {
    const { env } = createEnvironment()
    const bundle = makeBundle()
    const stored = await createEnrollment(bundle, "example.com", env)
    expect(stored).toBe(true)

    const enrollments = await listEnrollments(env)
    expect(enrollments.length).toBe(1)
    expect(enrollments[0].domain).toBe("example.com")
    expect(enrollments[0].maskedName).toBe("J*** S***")
    expect(enrollments[0].circuitVersion).toBe("0.20.0")
    expect(enrollments[0].certificateRegistryRoot).toBe("0x1bcacb112233")

    const unlocked = await unlockEnrollment(enrollments[0].id, env)
    expect(unlocked).toEqual(bundle)
  })

  test("multiple documents are stored side by side; same document replaces", async () => {
    const { env } = createEnvironment()
    const john = makeBundle("0x1111")
    const mary = makeBundle(
      "0x2222",
      "P<ZKRSMITH<<MARY<MILLER<<<<<<<<<<<<<<<<<<<<<ZP2222222_ZKR750302_F300101_<<<<<<<<<<<<<<<<",
    )
    await createEnrollment(john, "example.com", env)
    await createEnrollment(mary, "example.com", env)
    expect((await listEnrollments(env)).length).toBe(2)

    // Saving John again replaces his record instead of duplicating it
    await createEnrollment(john, "example.com", env)
    const enrollments = await listEnrollments(env)
    expect(enrollments.length).toBe(2)
    expect(enrollments.map((e) => e.maskedName).sort()).toEqual(["J*** S***", "M*** S***"])
  })

  test("each saved document unlocks with its own passkey", async () => {
    const { env } = createEnvironment()
    const john = makeBundle("0x1111")
    const mary = makeBundle(
      "0x2222",
      "P<ZKRSMITH<<MARY<MILLER<<<<<<<<<<<<<<<<<<<<<ZP2222222_ZKR750302_F300101_<<<<<<<<<<<<<<<<",
    )
    await createEnrollment(john, "example.com", env)
    await createEnrollment(mary, "example.com", env)
    expect(await unlockEnrollment(getEnrollmentId(john), env)).toEqual(john)
    expect(await unlockEnrollment(getEnrollmentId(mary), env)).toEqual(mary)
  })

  test("PRF results only available via get() still stores", async () => {
    const { env } = createEnvironment({ prfOnCreate: false })
    const bundle = makeBundle()
    expect(await createEnrollment(bundle, "example.com", env)).toBe(true)
    expect(await unlockEnrollment(getEnrollmentId(bundle), env)).toEqual(bundle)
  })

  test("PRF unsupported: nothing is stored", async () => {
    const { env, records } = createEnvironment({ prfSupported: false })
    expect(await createEnrollment(makeBundle(), "example.com", env)).toBe(false)
    expect(records.size).toBe(0)
    expect(await listEnrollments(env)).toEqual([])
  })

  test("deleteEnrollment removes one record by id, or all", async () => {
    const { env } = createEnvironment()
    const john = makeBundle("0x1111")
    const mary = makeBundle(
      "0x2222",
      "P<ZKRSMITH<<MARY<MILLER<<<<<<<<<<<<<<<<<<<<<ZP2222222_ZKR750302_F300101_<<<<<<<<<<<<<<<<",
    )
    await createEnrollment(john, "example.com", env)
    await createEnrollment(mary, "example.com", env)

    await deleteEnrollment(getEnrollmentId(john), env)
    let enrollments = await listEnrollments(env)
    expect(enrollments.length).toBe(1)
    expect(enrollments[0].maskedName).toBe("M*** S***")
    await expect(unlockEnrollment(getEnrollmentId(john), env)).rejects.toThrow("No such enrollment")

    await deleteEnrollment(undefined, env)
    enrollments = await listEnrollments(env)
    expect(enrollments.length).toBe(0)
  })

  test("tampered ciphertext fails to decrypt", async () => {
    const { env, records } = createEnvironment()
    const bundle = makeBundle()
    await createEnrollment(bundle, "example.com", env)
    const id = getEnrollmentId(bundle)
    const record = records.get(id) as { ciphertext: ArrayBuffer }
    const tampered = new Uint8Array(record.ciphertext)
    tampered[0] ^= 0xff
    record.ciphertext = tampered.buffer
    await expect(unlockEnrollment(id, env)).rejects.toThrow()
  })

  test("bundle failing validation on unlock is rejected", async () => {
    const { env, records } = createEnvironment()
    const bundle = makeBundle()
    // Store a structurally invalid bundle by bypassing validation on write
    bundle.baseSubproofs.pop()
    await createEnrollment(bundle, "example.com", env)
    expect(records.size).toBe(1)
    await expect(unlockEnrollment(getEnrollmentId(bundle), env)).rejects.toThrow("invalid")
  })
})

// ---------------------------------------------------------------------------
// Bridge message gating
// ---------------------------------------------------------------------------

describe("enrollment bridge message", () => {
  const TOPIC = "test-topic"

  function makeSdk(enableBrowserEnrollment: boolean) {
    const sdk = new ZKPassport("example.com")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internal = sdk as any
    internal.topicToLocalConfig[TOPIC] = {
      validity: 604800,
      mode: "fast",
      devMode: true,
      uniqueIdentifierType: undefined,
      oprfKeyId: null,
      returnDeepLink: undefined,
      enableBrowserEnrollment,
    }
    internal.topicToConfig[TOPIC] = { age: { gte: 18 } }
    internal.topicToProofs[TOPIC] = []
    internal.topicToFailedProofCount[TOPIC] = 0
    internal.onEnrollmentAvailableCallbacks[TOPIC] = []
    return { sdk, internal }
  }

  test("valid bundle is stashed when enabled", async () => {
    const { internal } = makeSdk(true)
    await internal.handleEncryptedMessage(TOPIC, {
      jsonrpc: "2.0",
      id: "1",
      method: "enrollment",
      params: makeBundle(),
    })
    expect(internal.topicToPendingEnrollment[TOPIC]).toBeDefined()
  })

  test("bundle is ignored when the RP did not opt in", async () => {
    const { internal } = makeSdk(false)
    await internal.handleEncryptedMessage(TOPIC, {
      jsonrpc: "2.0",
      id: "1",
      method: "enrollment",
      params: makeBundle(),
    })
    expect(internal.topicToPendingEnrollment[TOPIC]).toBeUndefined()
  })

  test("malformed bundle is ignored", async () => {
    const { internal } = makeSdk(true)
    await internal.handleEncryptedMessage(TOPIC, {
      jsonrpc: "2.0",
      id: "1",
      method: "enrollment",
      params: { version: 1, witness: {} },
    })
    expect(internal.topicToPendingEnrollment[TOPIC]).toBeUndefined()
  })

  test("be=1 is appended to the URL only for eligible requests", () => {
    const { sdk, internal } = makeSdk(true)
    internal.topicToService[TOPIC] = { name: "test", logo: "", purpose: "test" }
    internal.topicToPublicKey[TOPIC] = "pubkey"
    expect(sdk.getUrl(TOPIC)).toContain("&be=1")

    // Facematch query is not locally provable
    internal.topicToConfig[TOPIC] = { facematch: { mode: "regular" } }
    expect(sdk.getUrl(TOPIC)).not.toContain("&be=1")

    // Compressed mode falls back to the QR flow
    internal.topicToConfig[TOPIC] = { age: { gte: 18 } }
    internal.topicToLocalConfig[TOPIC].mode = "compressed"
    expect(sdk.getUrl(TOPIC)).not.toContain("&be=1")

    // Opt-in required
    internal.topicToLocalConfig[TOPIC].mode = "fast"
    internal.topicToLocalConfig[TOPIC].enableBrowserEnrollment = false
    expect(sdk.getUrl(TOPIC)).not.toContain("&be=1")

    // Toggling it back on via the public setter re-adds it
    sdk.setBrowserEnrollment(TOPIC, true)
    expect(sdk.getUrl(TOPIC)).toContain("&be=1")
  })
})
