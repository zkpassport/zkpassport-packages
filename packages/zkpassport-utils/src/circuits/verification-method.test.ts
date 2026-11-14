import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { PassportViewModel } from "../types"
import {
  VerificationMethod,
  VerificationTier,
  verificationMethodToHex,
  expandAllowedVerificationMethods,
  getVerificationMethodForPassport,
  isVerificationMethodAllowed,
  parseAllowedVerificationMethods,
  serializeAllowedVerificationMethods,
  getVerificationMethodFromAttestedIdProof,
  getVerificationMethodFromIntegrityProof,
  getVerificationMethodFromOuterProof,
  getTierForVerificationMethod,
  hasVerificationMethod,
  parseVerificationMethod,
} from "./verification-method"
import { getNumberOfPublicInputs } from "./index"

describe("verification method", () => {
  test("the tier is the hundreds digit, and zero or unknown values are rejected", () => {
    expect(getTierForVerificationMethod(VerificationMethod.ICAO_CHIP)).toBe(
      VerificationTier.GOVERNMENT_SIGNED,
    )
    expect(getTierForVerificationMethod(VerificationMethod.ISO_MDOC)).toBe(
      VerificationTier.GOVERNMENT_SIGNED,
    )
    expect(getTierForVerificationMethod(VerificationMethod.ATTESTED_CAPTURE_IOS)).toBe(
      VerificationTier.DEVICE_ATTESTED,
    )
    expect(getTierForVerificationMethod(VerificationMethod.ATTESTED_CAPTURE_ANDROID)).toBe(
      VerificationTier.DEVICE_ATTESTED,
    )
    expect(parseVerificationMethod("0xc8")).toBe(VerificationMethod.ATTESTED_CAPTURE_IOS)
    expect(() => parseVerificationMethod(0n)).toThrow("Unknown verification method")
    expect(() => parseVerificationMethod(1)).toThrow("Unknown verification method")
    expect(() => parseVerificationMethod("0x99")).toThrow("Unknown verification method")
    expect(verificationMethodToHex(VerificationMethod.ICAO_CHIP)).toBe("0x64")
  })

  test("a value outside the tier ranges has no tier", () => {
    expect(getTierForVerificationMethod(199 as VerificationMethod)).toBe(
      VerificationTier.GOVERNMENT_SIGNED,
    )
    expect(() => getTierForVerificationMethod(99 as VerificationMethod)).toThrow("in no tier")
    expect(() => getTierForVerificationMethod(300 as VerificationMethod)).toThrow("in no tier")
  })

  test("the tiers and schemes match the contracts' Credentials.sol", () => {
    // Every tier and scheme the contracts know, by name, so a value changed or added on one side
    // only fails here. The circuits' copy is checked by the fixture proofs' scheme public input.
    const sol = readFileSync(
      join(import.meta.dir, "../../../registry-contracts/src/lib/VerificationMethods.sol"),
      "utf8",
    )
    const constants = (library: string) => {
      const body = sol.match(new RegExp(`library ${library} \\{([^}]*)\\}`))?.[1] ?? ""
      return Object.fromEntries(
        [...body.matchAll(/uint256 constant (\w+) = (\d+);/g)].map(([, name, value]) => [
          name,
          Number(value),
        ]),
      )
    }
    const members = (e: object) =>
      Object.fromEntries(Object.entries(e).filter(([, value]) => typeof value === "number"))
    expect(constants("VerificationTier")).toEqual(members(VerificationTier))
    expect(constants("VerificationMethod")).toEqual(members(VerificationMethod))
  })

  test("a policy entry is a whole tier or one scheme", () => {
    expect(isVerificationMethodAllowed(VerificationMethod.ICAO_CHIP)).toBe(true)
    expect(isVerificationMethodAllowed(VerificationMethod.ATTESTED_CAPTURE_IOS)).toBe(false)
    const policy = [VerificationTier.GOVERNMENT_SIGNED, VerificationMethod.ATTESTED_CAPTURE_ANDROID]
    expect(isVerificationMethodAllowed(VerificationMethod.JPKI, policy)).toBe(true)
    expect(isVerificationMethodAllowed(VerificationMethod.ATTESTED_CAPTURE_ANDROID, policy)).toBe(
      true,
    )
    expect(isVerificationMethodAllowed(VerificationMethod.ATTESTED_CAPTURE_IOS, policy)).toBe(false)
    expect(isVerificationMethodAllowed(VerificationMethod.ICAO_CHIP, [])).toBe(false)
    expect(expandAllowedVerificationMethods([VerificationTier.DEVICE_ATTESTED])).toEqual([
      VerificationMethod.ATTESTED_CAPTURE_IOS,
      VerificationMethod.ATTESTED_CAPTURE_ANDROID,
      VerificationMethod.ATTESTED_CHIP_READ_IOS,
      VerificationMethod.ATTESTED_CHIP_READ_ANDROID,
    ])
    expect(expandAllowedVerificationMethods([2, 201])).toEqual(
      expandAllowedVerificationMethods([2]),
    )
  })

  test("a policy round-trips through its request URL form", () => {
    const policy = [VerificationTier.GOVERNMENT_SIGNED, VerificationMethod.ATTESTED_CAPTURE_IOS]
    expect(serializeAllowedVerificationMethods(policy)).toBe("1,200")
    expect(parseAllowedVerificationMethods("1,200")).toEqual(policy)
    expect(parseAllowedVerificationMethods("1, 200")).toEqual(policy)
    expect(parseAllowedVerificationMethods(null)).toBeNull()
    expect(parseAllowedVerificationMethods("")).toBeNull()
    expect(() => parseAllowedVerificationMethods("1,7")).toThrow(
      "Unknown verification tier or scheme",
    )
    expect(() => serializeAllowedVerificationMethods([3 as VerificationTier])).toThrow(
      "Unknown verification tier or scheme",
    )
  })

  test("the method of a saved ID is what was recorded, else its chip", () => {
    const chip = { sod: {} } as unknown as PassportViewModel
    expect(getVerificationMethodForPassport(chip)).toBe(VerificationMethod.ICAO_CHIP)
    const legacyCamera = { sod: undefined } as unknown as PassportViewModel
    expect(getVerificationMethodForPassport(legacyCamera)).toBe(
      VerificationMethod.ATTESTED_CAPTURE_IOS,
    )
    const android = {
      sod: undefined,
      verificationMethod: VerificationMethod.ATTESTED_CAPTURE_ANDROID,
    } as unknown as PassportViewModel
    expect(getVerificationMethodForPassport(android)).toBe(
      VerificationMethod.ATTESTED_CAPTURE_ANDROID,
    )
    // Saved before the rename, under the old field name
    const savedBefore = {
      sod: undefined,
      credentialScheme: VerificationMethod.ATTESTED_CAPTURE_ANDROID,
    } as unknown as PassportViewModel
    expect(getVerificationMethodForPassport(savedBefore)).toBe(
      VerificationMethod.ATTESTED_CAPTURE_ANDROID,
    )
  })

  test("the field exists from circuit version 0.23.0, and never on a proof without a version", () => {
    expect(hasVerificationMethod("0.21.0")).toBe(false)
    // 0.22.0 is live without it
    expect(hasVerificationMethod("0.22.0")).toBe(false)
    expect(hasVerificationMethod("0.23.0")).toBe(true)
    expect(hasVerificationMethod("1.0.0")).toBe(true)
    expect(hasVerificationMethod(undefined)).toBe(false)
  })

  test("public input counts grow by one with the field", () => {
    expect(getNumberOfPublicInputs("disclose_bytes", "0.21.0")).toBe(8)
    expect(getNumberOfPublicInputs("disclose_bytes", "0.23.0")).toBe(8)
    expect(getNumberOfPublicInputs("data_check_integrity_sa_sha256", "0.21.0")).toBe(2)
    expect(getNumberOfPublicInputs("data_check_integrity_sa_sha256", "0.23.0")).toBe(3)
    expect(getNumberOfPublicInputs("outer_count_6", "0.21.0")).toBe(11)
    expect(getNumberOfPublicInputs("outer_count_6", "0.23.0")).toBe(12)
    expect(getNumberOfPublicInputs("attested_id_ios", "0.23.0")).toBe(4)
    // Signature checks are untouched by the field
    expect(getNumberOfPublicInputs("sig_check_dsc_x", "0.23.0")).toBe(
      getNumberOfPublicInputs("sig_check_dsc_x", "0.21.0"),
    )
  })

  test("reads the scheme from each proof layout", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `0x${i}`)
    expect(
      getVerificationMethodFromIntegrityProof({ publicInputs: ["0x1", "0x2"], proof: [] }),
    ).toBeUndefined()
    expect(
      getVerificationMethodFromIntegrityProof({ publicInputs: ["0x1", "0x2", "0x64"], proof: [] }),
    ).toBe(VerificationMethod.ICAO_CHIP)
    expect(
      getVerificationMethodFromAttestedIdProof({ publicInputs: ["0xa", "0xb", "0xc9"], proof: [] }),
    ).toBe(VerificationMethod.ATTESTED_CAPTURE_ANDROID)
    expect(
      getVerificationMethodFromOuterProof({
        publicInputs: [...eight, "0x3", "0x4", "0x64"],
        proof: [],
      }),
    ).toBe(VerificationMethod.ICAO_CHIP)
  })
})
