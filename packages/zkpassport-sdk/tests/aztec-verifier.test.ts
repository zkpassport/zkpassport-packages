import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createRegistryClient } from "@zkpassport/registry"
import type { ProofResult, SupportedChain } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import { ZKPassport } from "../src/index"

// A real outer_count_5 proof of {age, bind}, the one the Aztec library's TXE tests verify
type AgeFixture = {
  circuit: string
  circuitVersion: `${number}.${number}.${number}`
  vkeyFields: string[]
  vkeyHashPoseidon2: string
  proof: string[]
  publicInputs: string[]
}
const fixture = JSON.parse(
  readFileSync(
    new URL("../../aztec/test-harness/fixtures/outer_count_5_age.json", import.meta.url),
    "utf-8",
  ),
) as AgeFixture

const bare = (field: string) => field.replace(/^0x/, "").padStart(64, "0")
const hexField = (field: string | number) =>
  `0x${(typeof field === "number" ? field.toString(16) : bare(field)).padStart(64, "0")}`

describe("getAztecVerifierParameters", () => {
  const proof: ProofResult = {
    name: fixture.circuit,
    version: fixture.circuitVersion,
    vkeyHash: fixture.vkeyHashPoseidon2,
    proof: [...fixture.publicInputs, ...fixture.proof].map(bare).join(""),
  }
  // The hosted package of the outer circuit carries its vk as bytes, base64
  const vkey = Buffer.from(fixture.vkeyFields.map(bare).join(""), "hex").toString("base64")

  let originalFetch: typeof globalThis.fetch
  let fetchedUrls: string[]

  beforeEach(async () => {
    const circuitRoot = await calculateCircuitRoot({ hashes: [fixture.vkeyHashPoseidon2] })
    originalFetch = globalThis.fetch
    fetchedUrls = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input.toString()).href
      fetchedUrls.push(url)
      if (url.includes("/by-version/")) {
        return Response.json({
          version: fixture.circuitVersion,
          root: circuitRoot,
          circuits: { [fixture.circuit]: { hash: fixture.vkeyHashPoseidon2 } },
        })
      }
      return Response.json({
        name: fixture.circuit,
        hash: fixture.vkeyHashPoseidon2,
        vkey_hash: fixture.vkeyHashPoseidon2,
        noir_version: "1.0.0",
        bb_version: "6.0.0",
        vkey,
      })
    }) as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  /** The URLs of the circuit manifest and the outer circuit on a network's circuits host */
  function getCircuitUrls(chain: SupportedChain): string[] {
    const registryClient = createRegistryClient(chain)
    return [
      registryClient.getUrlForCircuitManifestByVersion(fixture.circuitVersion),
      registryClient.getUrlForPackagedCircuits(fixture.vkeyHashPoseidon2),
    ].map((url) => new URL(url).href)
  }

  test("lays out the proof capsule as the vk, the proof and its public inputs", async () => {
    const { capsules } = await new ZKPassport("example.com").getAztecVerifierParameters({ proof })

    expect(capsules).toEqual([
      {
        slot: 1,
        fields: [...fixture.vkeyFields, ...fixture.proof, ...fixture.publicInputs].map(hexField),
      },
    ])
    expect(capsules[0].fields).toHaveLength(583)
  })

  test("adds a capsule for each disclosure, sanctions and face match the proof carries", async () => {
    const mask = Array(90).fill(0)
    const bytes = Array(90).fill(0)
    mask[54] = 1
    bytes[54] = 0x46
    const rootKeyLeaf = "0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b"
    const appIdHash = "0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b"

    const { capsules } = await new ZKPassport("example.com").getAztecVerifierParameters({
      proof: {
        ...proof,
        committedInputs: {
          disclose_bytes: { discloseMask: mask, disclosedBytes: bytes },
          exclusion_check_sanctions: { rootHash: "0x2a5a", isStrict: false },
          facematch: {
            rootKeyLeaf,
            environment: "production",
            appIdHash,
            integrityPubkeyHash: "0x00",
            mode: "strict",
          },
        },
      },
    })

    expect(capsules.slice(1)).toEqual([
      { slot: 2, fields: [...mask, ...bytes].map(hexField) },
      { slot: 3, fields: [hexField("0x2a5a")] },
      { slot: 4, fields: [rootKeyLeaf, 1, appIdHash, "0x00", 2].map(hexField) },
    ])
  })

  test("reads the vk from the circuits host of the Aztec network the proof is bound to", async () => {
    const zkPassport = new ZKPassport("example.com")

    await zkPassport.getAztecVerifierParameters({
      proof: { ...proof, committedInputs: { bind: { data: { chain: "aztec_testnet" } } } },
    })
    expect(fetchedUrls).toEqual(getCircuitUrls("aztec_testnet"))

    fetchedUrls = []
    await zkPassport.getAztecVerifierParameters({ proof })
    expect(fetchedUrls).toEqual(getCircuitUrls("aztec"))
  })

  test("rejects a proof whose vk hash isn't the circuit's", async () => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: { ...proof, vkeyHash: "0x1234" },
      }),
    ).rejects.toThrow(/vkey hash 0x1234/)
  })

  test("rejects a proof that isn't an outer_count proof", async () => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: { ...proof, name: "outer_evm_5" },
      }),
    ).rejects.toThrow(/cannot be verified on Aztec/)
    expect(fetchedUrls).toEqual([])
  })
})
