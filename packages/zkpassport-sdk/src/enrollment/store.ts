import { sha256 } from "@noble/hashes/sha2.js"
import { EnrollmentBundle, mrzFromDg1, validateEnrollmentBundle } from "@zkpassport/utils"

/**
 * Encrypted browser-side storage for enrollment bundles.
 *
 * Each bundle is encrypted with an AES-256-GCM key derived (HKDF-SHA256) from the
 * output of the WebAuthn PRF extension of a platform passkey, and persisted in
 * IndexedDB on the RP origin. Nothing sensitive is ever stored in plaintext: if the
 * authenticator does not support the PRF extension the bundle is discarded.
 *
 * Multiple IDs can be saved side by side; each record is keyed by a hash of the
 * document's private nullifier, so re-saving the same document replaces its record
 * instead of duplicating it. The only plaintext metadata kept per record is a
 * masked holder name ("J*** S***" — initials only, fixed-length mask) so the UI
 * can present a recognizable list without a passkey ceremony.
 */

const DB_NAME = "zkpassport-enrollment"
const DB_VERSION = 1
const STORE_NAME = "enrollments"
const HKDF_INFO = "zkpassport-enrollment-v1"

export type EnrollmentRecord = {
  schemaVersion: 1 | 2
  // Stable per-document identifier (hash of the private nullifier)
  id?: string
  // Masked holder name, e.g. "J*** S***" (initials only)
  maskedName?: string
  createdAt: number
  domain: string
  credentialId: ArrayBuffer
  prfSalt: ArrayBuffer
  hkdfSalt: ArrayBuffer
  iv: ArrayBuffer
  ciphertext: ArrayBuffer
  // Plaintext metadata (non-sensitive) readable without a passkey ceremony,
  // used for offer/staleness decisions
  circuitVersion: string
  certificateRegistryRoot: string
}

export type EnrollmentMeta = {
  id: string
  maskedName: string | null
  createdAt: number
  domain: string
  circuitVersion: string
  certificateRegistryRoot: string
}

/**
 * Injectable browser environment, so the store can be unit-tested with fakes.
 */
export type EnrollmentStoreEnvironment = {
  credentials: CredentialsContainer
  indexedDB: IDBFactory
  subtle: SubtleCrypto
  getRandomValues: (array: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>
}

function defaultEnvironment(): EnrollmentStoreEnvironment | undefined {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    !navigator.credentials ||
    typeof indexedDB === "undefined" ||
    !globalThis.crypto?.subtle
  ) {
    return undefined
  }
  return {
    credentials: navigator.credentials,
    indexedDB,
    subtle: globalThis.crypto.subtle,
    getRandomValues: (array) => globalThis.crypto.getRandomValues(array),
  }
}

/**
 * Cheap, ceremony-free feature detection. A `true` result means a passkey with PRF
 * can plausibly be created; actual PRF support is only known after `create()`.
 */
export async function isEnrollmentStorageSupported(
  env: EnrollmentStoreEnvironment | undefined = defaultEnvironment(),
): Promise<boolean> {
  if (!env) return false
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false
  try {
    const available =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    if (!available) return false
    // Where supported, check the client capability for the PRF extension
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getCapabilities = (window.PublicKeyCredential as any).getClientCapabilities as
      | (() => Promise<Record<string, boolean>>)
      | undefined
    if (getCapabilities) {
      try {
        const capabilities = await getCapabilities.call(window.PublicKeyCredential)
        if (capabilities && capabilities["extension:prf"] === false) return false
      } catch {
        // Capability probing is best-effort
      }
    }
    return true
  } catch {
    return false
  }
}

/**
 * Stable per-document record id: hash of the private nullifier, so saving the
 * same document again replaces its record.
 */
export function getEnrollmentId(bundle: EnrollmentBundle): string {
  const hash = sha256(new TextEncoder().encode(bundle.witness.privateNullifier.toLowerCase()))
  return Array.from(hash.slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Masked holder name from the MRZ inside the bundle's witness: initials only with
 * a fixed-length mask ("J*** S***"), so the plaintext metadata reveals nothing
 * beyond the initials.
 */
export function getMaskedName(bundle: EnrollmentBundle): string | null {
  try {
    const mrz = mrzFromDg1(bundle.witness.dg1)
    const isIDCard = mrz.length === 90
    const nameField = isIDCard ? mrz.slice(60, 90) : mrz.slice(5, 44)
    const separatorIndex = nameField.indexOf("<<")
    const lastName = separatorIndex >= 0 ? nameField.slice(0, separatorIndex) : nameField
    const givenNames = separatorIndex >= 0 ? nameField.slice(separatorIndex + 2) : ""
    const firstName = givenNames.split("<")[0] ?? ""
    const mask = (name: string) => (name.length > 0 ? `${name[0].toUpperCase()}***` : "")
    const masked = [mask(firstName), mask(lastName)].filter(Boolean).join(" ")
    return masked.length > 0 ? masked : null
  } catch {
    return null
  }
}

function openDatabase(env: EnrollmentStoreEnvironment): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = env.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"))
  })
}

async function withStore<T>(
  env: EnrollmentStoreEnvironment,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase(env)
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const request = operation(tx.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error("IndexedDB operation failed"))
    })
  } finally {
    db.close()
  }
}

async function getAllRecords(
  env: EnrollmentStoreEnvironment,
): Promise<Array<{ key: string; record: EnrollmentRecord }>> {
  const [keys, values] = await Promise.all([
    withStore<IDBValidKey[]>(env, "readonly", (store) => store.getAllKeys()),
    withStore<EnrollmentRecord[]>(env, "readonly", (store) => store.getAll()),
  ])
  return keys
    .map((key, index) => ({ key: String(key), record: values[index] }))
    .filter(
      ({ record }) =>
        record && (record.schemaVersion === 1 || record.schemaVersion === 2) && record.ciphertext,
    )
}

function toMeta(key: string, record: EnrollmentRecord): EnrollmentMeta {
  return {
    id: record.id ?? key,
    maskedName: record.maskedName ?? null,
    createdAt: record.createdAt,
    domain: record.domain,
    circuitVersion: record.circuitVersion,
    certificateRegistryRoot: record.certificateRegistryRoot,
  }
}

async function deriveAesKey(
  env: EnrollmentStoreEnvironment,
  prfOutput: ArrayBuffer,
  hkdfSalt: ArrayBuffer,
): Promise<CryptoKey> {
  const keyMaterial = await env.subtle.importKey("raw", prfOutput, "HKDF", false, ["deriveKey"])
  return env.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: hkdfSalt,
      info: new TextEncoder().encode(HKDF_INFO),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

function getPrfResult(credential: PublicKeyCredential): ArrayBuffer | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extensions = credential.getClientExtensionResults() as any
  return extensions?.prf?.results?.first as ArrayBuffer | undefined
}

async function getPrfOutputViaAssertion(
  env: EnrollmentStoreEnvironment,
  credentialId: ArrayBuffer,
  prfSalt: ArrayBuffer,
): Promise<ArrayBuffer | undefined> {
  const challenge = env.getRandomValues(new Uint8Array(32))
  const assertion = (await env.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: "public-key", id: credentialId }],
      userVerification: "required",
      extensions: {
        prf: { eval: { first: prfSalt } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    },
  })) as PublicKeyCredential | null
  if (!assertion) return undefined
  return getPrfResult(assertion)
}

/**
 * Create a passkey with the PRF extension, derive an encryption key from its PRF
 * output, encrypt the bundle and persist it. MUST be called from a user gesture
 * (click handler) or the WebAuthn ceremony will be rejected by the browser.
 *
 * Saving the same document again replaces its record. Returns true when the
 * bundle was stored; false when the authenticator does not support PRF (the
 * bundle is discarded and nothing is stored).
 */
export async function createEnrollment(
  bundle: EnrollmentBundle,
  domain: string,
  env: EnrollmentStoreEnvironment | undefined = defaultEnvironment(),
): Promise<boolean> {
  if (!env) throw new Error("Enrollment storage is not available in this environment")
  const prfSalt = env.getRandomValues(new Uint8Array(32))
  const hkdfSalt = env.getRandomValues(new Uint8Array(32))
  const userId = env.getRandomValues(new Uint8Array(16))
  const challenge = env.getRandomValues(new Uint8Array(32))
  const maskedName = getMaskedName(bundle)

  const credential = (await env.credentials.create({
    publicKey: {
      rp: { name: "ZKPassport" },
      user: {
        id: userId,
        name: maskedName ? `zkpassport (${maskedName})` : "zkpassport",
        displayName: maskedName ? `ZKPassport — ${maskedName}` : "ZKPassport (this browser)",
      },
      challenge,
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      attestation: "none",
      extensions: {
        prf: { eval: { first: prfSalt } },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    },
  })) as PublicKeyCredential | null
  if (!credential) return false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extensions = credential.getClientExtensionResults() as any
  if (!extensions?.prf?.enabled && !extensions?.prf?.results?.first) {
    // Authenticator does not support the PRF extension: never store the bundle
    return false
  }

  // Some platforms (e.g. iCloud Keychain) only return PRF results from get(),
  // not create() — run an assertion right away in that case
  let prfOutput = getPrfResult(credential)
  if (!prfOutput) {
    prfOutput = await getPrfOutputViaAssertion(env, credential.rawId, prfSalt.buffer as ArrayBuffer)
    if (!prfOutput) return false
  }

  const key = await deriveAesKey(env, prfOutput, hkdfSalt.buffer as ArrayBuffer)
  const iv = env.getRandomValues(new Uint8Array(12))
  const ciphertext = await env.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode(domain),
    },
    key,
    new TextEncoder().encode(JSON.stringify(bundle)),
  )

  const id = getEnrollmentId(bundle)
  const record: EnrollmentRecord = {
    schemaVersion: 2,
    id,
    maskedName: maskedName ?? undefined,
    createdAt: Date.now(),
    domain,
    credentialId: credential.rawId,
    prfSalt: prfSalt.buffer as ArrayBuffer,
    hkdfSalt: hkdfSalt.buffer as ArrayBuffer,
    iv: iv.buffer as ArrayBuffer,
    ciphertext,
    circuitVersion: bundle.circuitVersion,
    certificateRegistryRoot: bundle.certificateRegistryRoot,
  }
  await withStore(env, "readwrite", (store) => store.put(record, id))
  return true
}

/**
 * List the non-sensitive metadata of all saved enrollments (no passkey ceremony),
 * newest first.
 */
export async function listEnrollments(
  env: EnrollmentStoreEnvironment | undefined = defaultEnvironment(),
): Promise<EnrollmentMeta[]> {
  if (!env) return []
  try {
    const records = await getAllRecords(env)
    return records
      .map(({ key, record }) => toMeta(key, record))
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

/**
 * Run a passkey assertion (PRF eval), derive the key and decrypt the stored bundle.
 * MUST be called from a user gesture. Throws when the enrollment doesn't exist,
 * the ceremony is cancelled, or the stored data fails to decrypt/validate.
 */
export async function unlockEnrollment(
  id: string,
  env: EnrollmentStoreEnvironment | undefined = defaultEnvironment(),
): Promise<EnrollmentBundle> {
  if (!env) throw new Error("Enrollment storage is not available in this environment")
  const record = await withStore<EnrollmentRecord | undefined>(env, "readonly", (store) =>
    store.get(id),
  )
  if (!record || !record.ciphertext) {
    throw new Error("No such enrollment stored in this browser")
  }
  const prfOutput = await getPrfOutputViaAssertion(env, record.credentialId, record.prfSalt)
  if (!prfOutput) {
    throw new Error("Passkey did not return a PRF result")
  }
  const key = await deriveAesKey(env, prfOutput, record.hkdfSalt)
  const plaintext = await env.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: new Uint8Array(record.iv),
      additionalData: new TextEncoder().encode(record.domain),
    },
    key,
    record.ciphertext,
  )
  const bundle = JSON.parse(new TextDecoder().decode(plaintext))
  if (!validateEnrollmentBundle(bundle)) {
    throw new Error("Stored enrollment bundle is invalid")
  }
  return bundle
}

/**
 * Delete one saved enrollment by id, or all of them when no id is given.
 * The passkeys themselves cannot be deleted from JS but become inert.
 */
export async function deleteEnrollment(
  id?: string,
  env: EnrollmentStoreEnvironment | undefined = defaultEnvironment(),
): Promise<void> {
  if (!env) return
  try {
    if (id) {
      await withStore(env, "readwrite", (store) => store.delete(id))
    } else {
      await withStore(env, "readwrite", (store) => store.clear())
    }
  } catch {
    // Best-effort deletion
  }
}
