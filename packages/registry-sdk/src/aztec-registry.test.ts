import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createRegistryClient } from "./client"
import { normaliseHash } from "./utils"

const ROOT_A = `0x${"11".repeat(32)}`
const ROOT_B = `0x${"22".repeat(32)}`
const ROOT_C = `0x${"0c".repeat(32)}`

// The slots of the registry's storage variables
const PAUSED = 3n
const CONFIG = 7n
const LATEST = 8n
const ROOTS = 9n

// Slots in its maps, from @aztec-labs/stdlib's deriveStorageSlotInMap over CONFIG, LATEST and ROOTS
const LATEST_CERTIFICATE = 0x0cf8ce2bc3b2b2ae03caaab0d8e620df5c780e2b09a43f0b9bd0458847308ca4n
const LATEST_SANCTIONS = 0x1ff113a83ed3e36ef00580b705cf6d26496d42ad7de586d222f15796dc43983cn
const CONFIG_CERTIFICATE = 0x29dc8c7d0cd7c1466ed7fe05e006a2b50049d209be60512c9b2cb7af5a10a022n
const ROOT_STATUS_CERTIFICATE_A =
  0x1239804902fe7a8f2b08753c05be7de1904957cc78c6ec22236c3b4b5bb88a38n
const ROOT_STATUS_CERTIFICATE_B =
  0x1da807156d3ebec9208488b6fef95a4c8428e8d0074b963391aeffaa82311b61n
const ROOT_STATUS_CERTIFICATE_C =
  0x1b077163787b7e7e043eadfd484c26550c1982b65fa2f3d14c257d12c0ea8d9dn

const MODE_VALID_WITHIN_WINDOW = 3n
const WINDOW = 86400n
const REPLACED_AT = 5000n
const TESTNET_REGISTRY = "0x019de2b2c83e178733dce20707949a17ec3465caba6ccd24b3d861f151bf0f30"

describe("RegistryClient on an Aztec network", () => {
  let originalFetch: typeof globalThis.fetch
  let storage: Map<string, bigint>
  let blockTimestamp: bigint
  let fetchedUrls: string[]

  /** Writes a DelayedPublicMutable whose value changes from `before` to `after` at `changeAt` */
  function schedule(slot: bigint, before: bigint[], after: bigint[], changeAt = 0n) {
    storage.set(normaliseHash(slot), changeAt)
    for (const [offset, word] of [...before, ...after].entries()) {
      storage.set(normaliseHash(slot + 1n + BigInt(offset)), word)
    }
  }

  function setValue(slot: bigint, value: bigint[]) {
    schedule(
      slot,
      value.map(() => 0n),
      value,
    )
  }

  beforeEach(() => {
    storage = new Map()
    blockTimestamp = REPLACED_AT + 100n
    fetchedUrls = []

    setValue(CONFIG_CERTIFICATE, [MODE_VALID_WITHIN_WINDOW, WINDOW])
    setValue(LATEST_CERTIFICATE, [BigInt(ROOT_B), BigInt(ROOT_A)])
    setValue(ROOT_STATUS_CERTIFICATE_A, [1n, 0n, 100n, REPLACED_AT])
    setValue(ROOT_STATUS_CERTIFICATE_B, [1n, 0n, REPLACED_AT, 0n])

    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString()).href
      fetchedUrls.push(url)
      if (url.endsWith(".tree.json.gz")) {
        const root = url.slice(url.lastIndexOf("/") + 1, -".tree.json.gz".length)
        return Response.json([[root]])
      }

      const calls = JSON.parse(init?.body as string) as {
        id: number
        method: string
        params: string[]
      }[]
      return Response.json(
        calls.map(({ id, method, params }) => {
          if (method === "node_getBlockData") {
            return {
              jsonrpc: "2.0",
              id,
              result: { header: { globalVariables: { timestamp: blockTimestamp.toString() } } },
            }
          }
          expect(method).toBe("node_getPublicStorageAt")
          expect(params[1]).toBe(TESTNET_REGISTRY)
          return { jsonrpc: "2.0", id, result: normaliseHash(storage.get(params[2]) ?? 0n) }
        }),
      )
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("reads the latest root from the network's registry", async () => {
    const client = createRegistryClient("aztec_testnet")

    expect(await client.getLatestCertificateRoot()).toBe(ROOT_B)
    expect(fetchedUrls).toEqual(["https://aztec-testnet.drpc.org/"])
  })

  test("reads a scheduled latest root only once the node's latest block reaches its time", async () => {
    const client = createRegistryClient("aztec_testnet")
    schedule(
      LATEST_CERTIFICATE,
      [BigInt(ROOT_B), BigInt(ROOT_A)],
      [BigInt(ROOT_C), BigInt(ROOT_B)],
      9000n,
    )

    blockTimestamp = 8999n
    expect(await client.getLatestCertificateRoot()).toBe(ROOT_B)

    blockTimestamp = 9000n
    expect(await client.getLatestCertificateRoot()).toBe(ROOT_C)
  })

  test("reads each root set's latest root from its own slot", async () => {
    const client = createRegistryClient("aztec_testnet")
    setValue(LATEST_SANCTIONS, [BigInt(ROOT_C), 0n])

    expect(await client.getLatestSanctionsRoot()).toBe(ROOT_C)
  })

  test("accepts the latest root at any time", async () => {
    const client = createRegistryClient("aztec_testnet")

    expect(await client.isCertificateRootValid(ROOT_B, Number(REPLACED_AT + 10n * WINDOW))).toBe(
      true,
    )
  })

  test("accepts a replaced root until the registry's window after its replacement", async () => {
    const client = createRegistryClient("aztec_testnet")

    expect(await client.isCertificateRootValid(ROOT_A, Number(REPLACED_AT + WINDOW))).toBe(true)
    expect(await client.isCertificateRootValid(ROOT_A, Number(REPLACED_AT + WINDOW + 1n))).toBe(
      false,
    )
  })

  test("rejects a root the registry doesn't have, or has only scheduled", async () => {
    const client = createRegistryClient("aztec_testnet")

    expect(await client.isCertificateRootValid(ROOT_C, Number(REPLACED_AT))).toBe(false)

    schedule(ROOT_STATUS_CERTIFICATE_C, [0n, 0n, 0n, 0n], [1n, 0n, 100n, 0n], blockTimestamp + 1n)
    expect(await client.isCertificateRootValid(ROOT_C, Number(REPLACED_AT))).toBe(false)
  })

  test("rejects a revoked root", async () => {
    const client = createRegistryClient("aztec_testnet")
    setValue(ROOT_STATUS_CERTIFICATE_B, [1n, 1n, REPLACED_AT, 0n])

    expect(await client.isCertificateRootValid(ROOT_B, Number(REPLACED_AT))).toBe(false)
  })

  test("rejects every root while the registry is paused", async () => {
    const client = createRegistryClient("aztec_testnet")
    setValue(PAUSED, [1n])

    expect(await client.isCertificateRootValid(ROOT_B, Number(REPLACED_AT))).toBe(false)
  })

  test("downloads the latest root's sanctions tree from the network's CDN", async () => {
    const client = createRegistryClient("aztec_testnet")
    setValue(LATEST_SANCTIONS, [BigInt(ROOT_C), 0n])

    const { root } = await client.getSanctionsTree()

    expect(root).toBe(ROOT_C)
    expect(fetchedUrls[fetchedUrls.length - 1]).toBe(
      `https://sanctions.zkpassport.id/testnet/${ROOT_C}.tree.json.gz`,
    )
  })

  test("has no root details or historical roots", async () => {
    const client = createRegistryClient("aztec_testnet")

    await expect(client.getCertificateRootDetails(ROOT_B)).rejects.toThrow(
      "only available on EVM chains",
    )
    await expect(client.getHistoricalCertificateRoots(1)).rejects.toThrow(
      "only available on EVM chains",
    )
  })
})

describe("ZKPassportRegistry's storage layout", () => {
  test("keeps the slots the reader reads", () => {
    expect(compiledRegistrySlots()).toMatchObject({
      paused: PAUSED,
      config: CONFIG,
      latest: LATEST,
      roots: ROOTS,
    })
  })
})

type StructField = { name: string; value: { fields?: StructField[]; value?: string } }

/**
 * The slot of each storage variable in the ZKPassportRegistry artifact that @zkpassport/aztec ships,
 * which its CI keeps equal to the compiled registry
 */
function compiledRegistrySlots(): Record<string, bigint> {
  const artifactUrl = new URL("../../aztec/ts/registry/ZKPassportRegistry.json", import.meta.url)
  const artifact = JSON.parse(readFileSync(artifactUrl, "utf8")) as {
    outputs: { globals: { storage: { value: StructField["value"] }[] } }
  }
  const variables =
    artifact.outputs.globals.storage[0].value.fields?.find((field) => field.name === "fields")
      ?.value.fields ?? []

  return Object.fromEntries(
    variables.map(({ name, value }) => {
      const slot = value.fields?.find((field) => field.name === "slot")?.value.value
      return [name, BigInt(`0x${slot}`)]
    }),
  )
}
