import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { createRegistryClient } from "@zkpassport/registry"
import type { FacematchCommittedInputs, ProofResult, SupportedChain } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import {
  APPLE_APP_ATTEST_ROOT_KEY_HASH,
  GOOGLE_APP_ATTEST_ECDSA_P384_ROOT_KEY_HASH,
  ZKPASSPORT_ANDROID_APP_ID_HASH,
  ZKPASSPORT_IOS_APP_ID_HASH,
} from "../src/constants"
import { ZKPassport } from "../src/index"

// A real circuits 0.23.0 outer_count_5 proof of {age, bind}, the one the Aztec library's TXE tests
// verify
type AgeFixture = {
  circuit: string
  circuitVersion: `${number}.${number}.${number}`
  circuitVersionPacked: string
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

const USER = `0x${"11".repeat(32)}`
// The tier 2 outer circuit answering the same {age, bind} request as the fixture
const ATTESTED_CIRCUIT = "outer_attested_id_count_3"
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
  // The outer circuit the stubbed circuits host serves the fixture's vk as
  let servedCircuit: string

  beforeEach(async () => {
    const circuitRoot = await calculateCircuitRoot({ hashes: [fixture.vkeyHashPoseidon2] })
    servedCircuit = fixture.circuit
    originalFetch = globalThis.fetch
    fetchedUrls = []
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = new URL(input.toString()).href
      fetchedUrls.push(url)
      if (url.includes("/by-version/")) {
        return Response.json({
          version: fixture.circuitVersion,
          root: circuitRoot,
          circuits: { [servedCircuit]: { hash: fixture.vkeyHashPoseidon2 } },
        })
      }
      return Response.json({
        name: servedCircuit,
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

  test("lays out the proof capsule as the vk, the proof, its public inputs and its version", async () => {
    const { capsules } = await new ZKPassport("example.com").getAztecVerifierParameters({
      proof,
      network: "aztec",
    })

    expect(capsules).toEqual([
      {
        slot: 1,
        fields: [
          ...[...fixture.vkeyFields, ...fixture.proof, ...fixture.publicInputs].map(hexField),
          fixture.circuitVersionPacked,
        ],
      },
    ])
    expect(capsules[0].fields).toHaveLength(585)
  })

  test("adds a capsule for each disclosure and sanctions check the proof carries", async () => {
    const mask = Array(90).fill(0)
    const bytes = Array(90).fill(0)
    mask[54] = 1
    bytes[54] = 0x46

    const { capsules } = await new ZKPassport("example.com").getAztecVerifierParameters({
      proof: {
        ...proof,
        committedInputs: {
          disclose_bytes: { discloseMask: mask, disclosedBytes: bytes },
          exclusion_check_sanctions: { rootHash: "0x2a5a", isStrict: false },
        },
      },
      network: "aztec",
    })

    expect(capsules.slice(1)).toEqual([
      { slot: 2, fields: [...mask, ...bytes].map(hexField) },
      { slot: 3, fields: [hexField("0x2a5a")] },
    ])
  })

  // A strict face match from ZKPassport's iOS app
  const iosFacematch: FacematchCommittedInputs = {
    rootKeyLeaf: APPLE_APP_ATTEST_ROOT_KEY_HASH,
    environment: "production",
    appIdHash: ZKPASSPORT_IOS_APP_ID_HASH,
    integrityPubkeyHash: "0x00",
    mode: "strict",
  }

  // The fixture as a camera-read ID's proof: the attested ID commitment first among its param
  // commitments, and verification method 200. The SDK reads the public inputs, it doesn't verify them.
  const attestedProof: ProofResult = {
    name: ATTESTED_CIRCUIT,
    version: fixture.circuitVersion,
    vkeyHash: fixture.vkeyHashPoseidon2,
    proof: [
      ...fixture.publicInputs.slice(0, 5),
      "0x2a77",
      ...fixture.publicInputs.slice(5, -1),
      hexField(200),
      ...fixture.proof,
    ]
      .map(bare)
      .join(""),
    committedInputs: { attested_id_ios: iosFacematch },
  }

  test("adds the attested ID capsule of a camera-read ID's proof, and sizes its proof capsule", async () => {
    servedCircuit = ATTESTED_CIRCUIT

    const { capsules } = await new ZKPassport("example.com").getAztecVerifierParameters({
      proof: attestedProof,
      network: "aztec",
    })

    expect(capsules[0].slot).toEqual(1)
    expect(capsules[0].fields).toHaveLength(586)
    expect(capsules[0].fields.slice(115 + 458, 115 + 458 + 12)).toEqual(
      [
        ...fixture.publicInputs.slice(0, 5),
        "0x2a77",
        ...fixture.publicInputs.slice(5, -1),
        hexField(200),
      ].map(hexField),
    )
    expect(capsules.slice(1)).toEqual([
      {
        slot: 5,
        fields: [
          hexField(APPLE_APP_ATTEST_ROOT_KEY_HASH),
          hexField(1),
          hexField(ZKPASSPORT_IOS_APP_ID_HASH),
          hexField(0),
          hexField(2),
          hexField(0),
        ],
      },
    ])
  })

  test("reads an Android camera read's attestation", async () => {
    servedCircuit = ATTESTED_CIRCUIT

    const androidAttestation: FacematchCommittedInputs = {
      ...iosFacematch,
      rootKeyLeaf: GOOGLE_APP_ATTEST_ECDSA_P384_ROOT_KEY_HASH,
      appIdHash: ZKPASSPORT_ANDROID_APP_ID_HASH,
      integrityPubkeyHash: "0x1234",
      revocationRoot: "0x5678",
    }

    const { capsules } = await new ZKPassport("example.com").getAztecVerifierParameters({
      proof: { ...attestedProof, committedInputs: { attested_id_android: androidAttestation } },
      network: "aztec",
    })

    expect(capsules[1].slot).toEqual(5)
    expect(capsules[1].fields[0]).toEqual(hexField(GOOGLE_APP_ATTEST_ECDSA_P384_ROOT_KEY_HASH))
    expect(capsules[1].fields[5]).toEqual(hexField("0x5678"))
  })

  test("rejects a camera-read ID's proof without its attestation", async () => {
    servedCircuit = ATTESTED_CIRCUIT

    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: { ...attestedProof, committedInputs: {} },
        network: "aztec",
      }),
    ).rejects.toThrow(/attested ID/)
  })

  test("adds a capsule for a face match, its parameters in the order the proof commits them", async () => {
    const { capsules } = await new ZKPassport("example.com").getAztecVerifierParameters({
      proof: { ...proof, committedInputs: { facematch: iosFacematch } },
      network: "aztec",
    })

    expect(capsules.slice(1)).toEqual([
      {
        slot: 4,
        fields: [
          hexField(APPLE_APP_ATTEST_ROOT_KEY_HASH),
          hexField(1),
          hexField(ZKPASSPORT_IOS_APP_ID_HASH),
          hexField(0),
          hexField(2),
          hexField(0),
        ],
      },
    ])
  })

  test("adds the capsule of a face match from the Android app, with its revocation root", async () => {
    const androidFacematch: FacematchCommittedInputs = {
      rootKeyLeaf: GOOGLE_APP_ATTEST_ECDSA_P384_ROOT_KEY_HASH,
      environment: "production",
      appIdHash: ZKPASSPORT_ANDROID_APP_ID_HASH,
      integrityPubkeyHash: "0x1234",
      mode: "regular",
      revocationRoot: "0x5678",
    }

    const { capsules } = await new ZKPassport("example.com").getAztecVerifierParameters({
      proof: { ...proof, committedInputs: { facematch: androidFacematch } },
      network: "aztec",
    })

    expect(capsules.slice(1)).toEqual([
      {
        slot: 4,
        fields: [
          hexField(GOOGLE_APP_ATTEST_ECDSA_P384_ROOT_KEY_HASH),
          hexField(1),
          hexField(ZKPASSPORT_ANDROID_APP_ID_HASH),
          hexField("0x1234"),
          hexField(1),
          hexField("0x5678"),
        ],
      },
    ])
  })

  test("rejects a proof of a circuits release the Aztec library doesn't verify", async () => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: { ...proof, version: "0.22.0" },
        network: "aztec",
      }),
    ).rejects.toThrow(/0\.23\.x/)
    expect(fetchedUrls).toEqual([])
  })

  test("reads the vk from the circuits host of the Aztec network the proof is bound to", async () => {
    await new ZKPassport("example.com").getAztecVerifierParameters({
      proof: {
        ...proof,
        committedInputs: { bind: { data: { user_address: USER, chain: "aztec_testnet" } } },
      },
    })
    expect(new Set(fetchedUrls)).toEqual(new Set(getCircuitUrls("aztec_testnet")))
  })

  test("reads the vk from the network it's given for a proof bound to none", async () => {
    await new ZKPassport("example.com").getAztecVerifierParameters({
      proof,
      network: "aztec_testnet",
    })
    expect(new Set(fetchedUrls)).toEqual(new Set(getCircuitUrls("aztec_testnet")))
  })

  test("needs a network for a proof bound to none, rather than assuming one", async () => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({ proof }),
    ).rejects.toThrow(/pass the network/)
    expect(fetchedUrls).toEqual([])
  })

  test("rejects a network other than the one the proof is bound to", async () => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: {
          ...proof,
          committedInputs: { bind: { data: { user_address: USER, chain: "aztec_testnet" } } },
        },
        network: "aztec",
      }),
    ).rejects.toThrow(/bound to aztec_testnet/)
  })

  test.each([
    ["an address and custom data", { user_address: USER, custom_data: "order-42" }],
    ["custom data without an address", { custom_data: "order-42" }],
    ["the longest custom data", { user_address: USER, custom_data: "a".repeat(464) }],
  ])("reads the vk for a proof that binds %s on an Aztec network", async (_, data) => {
    await new ZKPassport("example.com").getAztecVerifierParameters({
      proof: { ...proof, committedInputs: { bind: { data: { ...data, chain: "aztec_testnet" } } } },
    })
    expect(new Set(fetchedUrls)).toEqual(new Set(getCircuitUrls("aztec_testnet")))
  })

  // The Aztec library's bind commits to the contract's network and a user address, custom data of
  // at most 464 bytes or both, so no network passed here can make another bind verify
  test.each([
    ["an address and no network", { user_address: USER }],
    ["a network alone", { chain: "aztec_testnet" }],
    [
      "custom data longer than 464 bytes",
      { user_address: USER, chain: "aztec_testnet", custom_data: "é".repeat(233) },
    ],
    [
      "an address shorter than an Aztec address",
      { user_address: "0x1122", chain: "aztec_testnet" },
    ],
  ])("rejects a proof that binds %s", async (_, data) => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: { ...proof, committedInputs: { bind: { data } } } as ProofResult,
        network: "aztec_testnet",
      }),
    ).rejects.toThrow(/request a new proof/)
    expect(fetchedUrls).toEqual([])
  })

  test("rejects a proof bound to a chain that isn't an Aztec network", async () => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: {
          ...proof,
          committedInputs: { bind: { data: { user_address: USER, chain: "ethereum" } } },
        },
      }),
    ).rejects.toThrow(/bound to ethereum/)
  })

  test("rejects a proof whose vk hash isn't the circuit's", async () => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: { ...proof, vkeyHash: "0x1234" },
        network: "aztec",
      }),
    ).rejects.toThrow(/vkey hash 0x1234/)
  })

  test("rejects a proof that isn't an outer_count proof", async () => {
    await expect(
      new ZKPassport("example.com").getAztecVerifierParameters({
        proof: { ...proof, name: "outer_evm_5" },
        network: "aztec",
      }),
    ).rejects.toThrow(/cannot be verified on Aztec/)
    expect(fetchedUrls).toEqual([])
  })
})
