import { describe, expect, test } from "bun:test"
import {
  getAztecDiscloseCapsule,
  getAztecFacematchCapsule,
  getAztecProofCapsule,
  getAztecSanctionsCapsule,
} from "./aztec"

const parts = {
  vk: Array(115).fill("01"),
  proof: Array(458).fill("02"),
  publicInputs: Array(10).fill("11"),
}

describe("getAztecProofCapsule", () => {
  test("lays out vk, proof and public inputs of outer_count_5 in 583 fields", () => {
    const capsule = getAztecProofCapsule(parts, 5)

    expect(capsule).toHaveLength(583)
    expect(capsule[0]).toBe(`0x${"01".padStart(64, "0")}`)
    expect(capsule[115]).toBe(`0x${"02".padStart(64, "0")}`)
    expect(capsule[573]).toBe(`0x${"11".padStart(64, "0")}`)
  })

  test("reads bare fields as hex, never as decimal", () => {
    const capsule = getAztecProofCapsule(parts, 5)

    expect(capsule[capsule.length - 1]).toBe(`0x${"11".padStart(64, "0")}`)
  })

  test("rejects a proof of another shape with the counts it has", () => {
    expect(() => getAztecProofCapsule({ ...parts, publicInputs: Array(9).fill("11") }, 5)).toThrow(
      /public inputs 9\/10/,
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

test("getAztecFacematchCapsule encodes the environment and mode as the circuits do", () => {
  const capsule = getAztecFacematchCapsule({
    rootKeyLeaf: "0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b",
    environment: "production",
    appIdHash: "0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b",
    integrityPubkeyHash: "0x00",
    mode: "strict",
  })

  expect(capsule.map(BigInt)).toEqual([
    0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340bn,
    1n,
    0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179bn,
    0n,
    2n,
  ])
})
