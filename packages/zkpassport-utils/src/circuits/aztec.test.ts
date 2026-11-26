import { describe, expect, test } from "bun:test"
import vectors from "../../conformance/vectors.json"
import type { FacematchCommittedInputs } from "../types"
import {
  AZTEC_FACE_MATCH_CAPSULE_SLOT,
  getAztecDiscloseCapsule,
  getAztecFacematchCapsule,
  getAztecOuterPublicInputCount,
  getAztecProofCapsule,
  getAztecSanctionsCapsule,
} from "./aztec"
import { getFacematchParameterCommitment } from "./facematch"

const parts = {
  vk: Array(115).fill("01"),
  proof: Array(458).fill("02"),
  publicInputs: Array(11).fill("11"),
  version: "0.23.0",
}

test("a circuits 0.23.x outer_count_N proof has N + 6 public inputs", () => {
  expect(getAztecOuterPublicInputCount(4)).toBe(10)
  expect(getAztecOuterPublicInputCount(5)).toBe(11)
})

// Its attested ID proof stands in for the chip's 3 and is committed like the disclosure proofs, so
// it answers the same request as an outer_count_(N + 2) proof with one public input more
test("a circuits 0.23.x outer_attested_id_count_N proof has N + 9 public inputs", () => {
  expect(getAztecOuterPublicInputCount(3, true)).toBe(12)
  expect(getAztecOuterPublicInputCount(3, true)).toBe(getAztecOuterPublicInputCount(5) + 1)
})

describe("getAztecProofCapsule", () => {
  test("lays out vk, proof, public inputs and version of outer_count_5 in 585 fields", () => {
    const capsule = getAztecProofCapsule(parts, 5)

    expect(capsule).toHaveLength(585)
    expect(capsule[0]).toBe(`0x${"01".padStart(64, "0")}`)
    expect(capsule[115]).toBe(`0x${"02".padStart(64, "0")}`)
    expect(capsule[573]).toBe(`0x${"11".padStart(64, "0")}`)
  })

  test("lays out an outer_attested_id_count_3 proof in 586 fields", () => {
    const capsule = getAztecProofCapsule({ ...parts, publicInputs: Array(12).fill("11") }, 3, true)

    expect(capsule).toHaveLength(586)
    expect(() => getAztecProofCapsule(parts, 3, true)).toThrow(/outer_attested_id_count_3/)
  })

  test("ends with the circuits release, packed as the registry keys vks", () => {
    const capsule = getAztecProofCapsule({ ...parts, version: "0.23.4" }, 5)

    expect(BigInt(capsule[584])).toBe((23n << 224n) | (4n << 208n))
  })

  test("reads bare fields as hex, never as decimal", () => {
    const capsule = getAztecProofCapsule(parts, 5)

    expect(capsule[583]).toBe(`0x${"11".padStart(64, "0")}`)
  })

  test("rejects a proof of a circuits release the Aztec library doesn't verify", () => {
    expect(() => getAztecProofCapsule({ ...parts, version: "0.22.0" }, 5)).toThrow(/0\.23\.x/)
    expect(() => getAztecProofCapsule({ ...parts, version: "0.24.0" }, 5)).toThrow(/0\.23\.x/)
  })

  test("rejects a proof of another shape with the counts it has", () => {
    expect(() => getAztecProofCapsule({ ...parts, publicInputs: Array(10).fill("11") }, 5)).toThrow(
      /public inputs 10\/11/,
    )
    expect(() => getAztecProofCapsule({ ...parts, vk: Array(114).fill("01") }, 5)).toThrow(
      /vk 114\/115/,
    )
  })

  test("rejects a field that isn't hex", () => {
    expect(() => getAztecProofCapsule({ ...parts, vk: [...parts.vk.slice(1), "0xzz"] }, 5)).toThrow(
      /Not a 32-byte hex field/,
    )
  })
})

describe("getAztecDiscloseCapsule", () => {
  test("lays out the mask, then the disclosed bytes", () => {
    const mask = Array(90).fill(0)
    const bytes = Array(90).fill(0)
    mask[54] = 1
    bytes[54] = 0x46

    const capsule = getAztecDiscloseCapsule(mask, bytes)

    expect(capsule).toHaveLength(180)
    expect(BigInt(capsule[54])).toBe(1n)
    expect(BigInt(capsule[90 + 54])).toBe(0x46n)
  })

  test("rejects a mask of another length", () => {
    expect(() => getAztecDiscloseCapsule(Array(89).fill(0), Array(90).fill(0))).toThrow(
      /mask 89\/90/,
    )
  })
})

test("getAztecSanctionsCapsule holds the sanctions root", () => {
  expect(getAztecSanctionsCapsule("0x2a5a")).toEqual([`0x${"2a5a".padStart(64, "0")}`])
})

describe("getAztecFacematchCapsule", () => {
  const iosStrict: FacematchCommittedInputs = {
    rootKeyLeaf: "0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b",
    environment: "production",
    appIdHash: "0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b",
    integrityPubkeyHash: "0x00",
    mode: "strict",
  }
  const field = (value: bigint) => `0x${value.toString(16).padStart(64, "0")}`

  test("goes in the slot the Aztec library reads it from", () => {
    expect(AZTEC_FACE_MATCH_CAPSULE_SLOT).toBe(4)
  })

  test("lays out the parameters in the order the proof commits them", () => {
    expect(getAztecFacematchCapsule(iosStrict)).toEqual([
      iosStrict.rootKeyLeaf,
      field(1n),
      iosStrict.appIdHash,
      field(0n),
      field(2n),
      field(0n),
    ])
  })

  const androidStrict: FacematchCommittedInputs = {
    rootKeyLeaf: "0x16700a2d9168a194fc85f237af5829b5a2be05b8ae8ac4879ada34cf54a9c211",
    environment: "production",
    appIdHash: "0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615d",
    integrityPubkeyHash: "0x12e3dc7cc8fec0205b51ff21825630865028f3be5bc64a6eec9ee5e71221319f",
    mode: "strict",
    revocationRoot: "0x23157e6435e936c4698498358363acb2a9a811908c4806e1087677338e1c5525",
  }

  test.each([
    ["facematch_ios_strict", iosStrict],
    ["facematch_android_strict", androidStrict],
  ])("holds what the %s conformance vector commits", async (name, facematch) => {
    const vector = vectors.vectors.find((v) => v.name === name)!
    const capsule = getAztecFacematchCapsule(facematch).map(BigInt)
    const [rootKeyLeaf, environment, appIdHash, integrityKey, mode, revocationRoot] = capsule

    const commitment = await getFacematchParameterCommitment(
      rootKeyLeaf,
      environment,
      appIdHash,
      mode,
      integrityKey,
      revocationRoot,
    )

    expect(field(commitment)).toBe(vector.commitment)
  })

  test("numbers a development environment 0 and a regular face match 1", () => {
    const capsule = getAztecFacematchCapsule({
      ...iosStrict,
      environment: "development",
      mode: "regular",
    })

    expect([capsule[1], capsule[4]]).toEqual([field(0n), field(1n)])
  })

  test("carries an Android face match's integrity key and revocation root", () => {
    const capsule = getAztecFacematchCapsule({
      ...iosStrict,
      integrityPubkeyHash: "0x1234",
      revocationRoot: "0x5678",
    })

    expect([capsule[3], capsule[5]]).toEqual([field(0x1234n), field(0x5678n)])
  })

  test("rejects a mode it doesn't know", () => {
    expect(() =>
      getAztecFacematchCapsule({
        ...iosStrict,
        mode: "lenient" as FacematchCommittedInputs["mode"],
      }),
    ).toThrow(/Unknown face match environment production or mode lenient/)
  })
})
