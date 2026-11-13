import { describe, expect, test } from "bun:test"
import {
  getAztecDiscloseCapsule,
  getAztecOuterPublicInputCount,
  getAztecProofCapsule,
  getAztecSanctionsCapsule,
} from "./aztec"

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

describe("getAztecProofCapsule", () => {
  test("lays out vk, proof, public inputs and version of outer_count_5 in 585 fields", () => {
    const capsule = getAztecProofCapsule(parts, 5)

    expect(capsule).toHaveLength(585)
    expect(capsule[0]).toBe(`0x${"01".padStart(64, "0")}`)
    expect(capsule[115]).toBe(`0x${"02".padStart(64, "0")}`)
    expect(capsule[573]).toBe(`0x${"11".padStart(64, "0")}`)
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
