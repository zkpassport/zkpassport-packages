import { describe, expect, test } from "bun:test"
import type { AllowedCredential, PassportViewModel } from "../types"
import {
  CredentialScheme,
  CredentialTier,
  applyCredentialPolicyToQuery,
  credentialSchemeToHex,
  parseCredentialRules,
  serializeCredentialRules,
  validateAllowedCredentials,
  expandAllowedCredentials,
  getCredentialSchemeForPassport,
  isCredentialAllowed,
  parseAllowedCredentials,
  serializeAllowedCredentials,
  getCredentialSchemeFromAttestedIdProof,
  getCredentialSchemeFromDisclosureProof,
  getCredentialSchemeFromIntegrityProof,
  getCredentialSchemeFromOuterProof,
  getTierForCredentialScheme,
  hasCredentialScheme,
  parseCredentialScheme,
} from "./credential-scheme"
import { getNumberOfPublicInputs } from "./index"

describe("credential scheme", () => {
  test("the tier is the hundreds digit, and zero or unknown values are rejected", () => {
    expect(getTierForCredentialScheme(CredentialScheme.ICAO_CHIP)).toBe(
      CredentialTier.GOVERNMENT_SIGNED,
    )
    expect(getTierForCredentialScheme(CredentialScheme.ISO_MDOC)).toBe(
      CredentialTier.GOVERNMENT_SIGNED,
    )
    expect(getTierForCredentialScheme(CredentialScheme.ATTESTED_CAPTURE_IOS)).toBe(
      CredentialTier.DEVICE_ATTESTED,
    )
    expect(getTierForCredentialScheme(CredentialScheme.ATTESTED_CAPTURE_ANDROID)).toBe(
      CredentialTier.DEVICE_ATTESTED,
    )
    expect(parseCredentialScheme("0xc8")).toBe(CredentialScheme.ATTESTED_CAPTURE_IOS)
    expect(() => parseCredentialScheme(0n)).toThrow("Unknown credential scheme")
    expect(() => parseCredentialScheme(1)).toThrow("Unknown credential scheme")
    expect(() => parseCredentialScheme("0x99")).toThrow("Unknown credential scheme")
    expect(credentialSchemeToHex(CredentialScheme.ICAO_CHIP)).toBe("0x64")
  })

  test("a policy entry is a whole tier or one scheme", () => {
    expect(isCredentialAllowed(CredentialScheme.ICAO_CHIP)).toBe(true)
    expect(isCredentialAllowed(CredentialScheme.ATTESTED_CAPTURE_IOS)).toBe(false)
    const policy = [CredentialTier.GOVERNMENT_SIGNED, CredentialScheme.ATTESTED_CAPTURE_ANDROID]
    expect(isCredentialAllowed(CredentialScheme.JPKI, policy)).toBe(true)
    expect(isCredentialAllowed(CredentialScheme.ATTESTED_CAPTURE_ANDROID, policy)).toBe(true)
    expect(isCredentialAllowed(CredentialScheme.ATTESTED_CAPTURE_IOS, policy)).toBe(false)
    expect(isCredentialAllowed(CredentialScheme.ICAO_CHIP, [])).toBe(false)
    expect(expandAllowedCredentials([CredentialTier.DEVICE_ATTESTED])).toEqual([
      CredentialScheme.ATTESTED_CAPTURE_IOS,
      CredentialScheme.ATTESTED_CAPTURE_ANDROID,
      CredentialScheme.ATTESTED_CHIP_READ_IOS,
      CredentialScheme.ATTESTED_CHIP_READ_ANDROID,
    ])
    expect(expandAllowedCredentials([2, 201])).toEqual(expandAllowedCredentials([2]))
  })

  test("a policy round-trips through its request URL form", () => {
    const policy = [CredentialTier.GOVERNMENT_SIGNED, CredentialScheme.ATTESTED_CAPTURE_IOS]
    expect(serializeAllowedCredentials(policy)).toBe("1,200")
    expect(parseAllowedCredentials("1,200")).toEqual(policy)
    expect(parseAllowedCredentials("1, 200")).toEqual(policy)
    expect(parseAllowedCredentials(null)).toBeNull()
    expect(parseAllowedCredentials("")).toBeNull()
    expect(() => parseAllowedCredentials("1,7")).toThrow("Unknown credential tier or scheme")
    expect(() => serializeAllowedCredentials([3 as CredentialTier])).toThrow(
      "Unknown credential tier or scheme",
    )
  })

  test("the scheme of a saved ID is what was recorded, else its chip", () => {
    const chip = { sod: {} } as unknown as PassportViewModel
    expect(getCredentialSchemeForPassport(chip)).toBe(CredentialScheme.ICAO_CHIP)
    const legacyCamera = { sod: undefined } as unknown as PassportViewModel
    expect(getCredentialSchemeForPassport(legacyCamera)).toBe(CredentialScheme.ATTESTED_CAPTURE_IOS)
    const android = {
      sod: undefined,
      credentialScheme: CredentialScheme.ATTESTED_CAPTURE_ANDROID,
    } as unknown as PassportViewModel
    expect(getCredentialSchemeForPassport(android)).toBe(CredentialScheme.ATTESTED_CAPTURE_ANDROID)
  })

  test("the field exists from circuit version 0.22.0, and never on a proof without a version", () => {
    expect(hasCredentialScheme("0.21.0")).toBe(false)
    expect(hasCredentialScheme("0.22.0")).toBe(true)
    expect(hasCredentialScheme("1.0.0")).toBe(true)
    expect(hasCredentialScheme(undefined)).toBe(false)
  })

  test("public input counts grow by one with the field", () => {
    expect(getNumberOfPublicInputs("disclose_bytes", "0.21.0")).toBe(8)
    expect(getNumberOfPublicInputs("disclose_bytes", "0.22.0")).toBe(9)
    expect(getNumberOfPublicInputs("data_check_integrity_sa_sha256", "0.21.0")).toBe(2)
    expect(getNumberOfPublicInputs("data_check_integrity_sa_sha256", "0.22.0")).toBe(3)
    expect(getNumberOfPublicInputs("outer_count_6", "0.21.0")).toBe(11)
    expect(getNumberOfPublicInputs("outer_count_6", "0.22.0")).toBe(12)
    expect(getNumberOfPublicInputs("attested_id_ios", "0.22.0")).toBe(3)
    // Signature checks are untouched by the field
    expect(getNumberOfPublicInputs("sig_check_dsc_x", "0.22.0")).toBe(
      getNumberOfPublicInputs("sig_check_dsc_x", "0.21.0"),
    )
  })

  test("reads the scheme from each proof layout", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `0x${i}`)
    expect(
      getCredentialSchemeFromDisclosureProof({ publicInputs: eight, proof: [] }),
    ).toBeUndefined()
    expect(
      getCredentialSchemeFromDisclosureProof({ publicInputs: [...eight, "0xc8"], proof: [] }),
    ).toBe(CredentialScheme.ATTESTED_CAPTURE_IOS)
    expect(
      getCredentialSchemeFromIntegrityProof({ publicInputs: ["0x1", "0x2"], proof: [] }),
    ).toBeUndefined()
    expect(
      getCredentialSchemeFromIntegrityProof({ publicInputs: ["0x1", "0x2", "0x64"], proof: [] }),
    ).toBe(CredentialScheme.ICAO_CHIP)
    expect(
      getCredentialSchemeFromAttestedIdProof({ publicInputs: ["0xa", "0xb", "0xc9"], proof: [] }),
    ).toBe(CredentialScheme.ATTESTED_CAPTURE_ANDROID)
    expect(
      getCredentialSchemeFromOuterProof({
        publicInputs: [...eight, "0x3", "0x4", "0x64"],
        proof: [],
      }),
    ).toBe(CredentialScheme.ICAO_CHIP)
  })
})

describe("credential policy rules", () => {
  const rule = { scheme: CredentialTier.DEVICE_ATTESTED, excludeCountries: ["IND", "ARE"] }

  test("a rule stands for its tier or scheme, within its limits", () => {
    const policy = [CredentialTier.GOVERNMENT_SIGNED, rule]
    expect(isCredentialAllowed(CredentialScheme.ATTESTED_CAPTURE_IOS, policy)).toBe(true)
    expect(
      isCredentialAllowed(CredentialScheme.ATTESTED_CAPTURE_IOS, policy, { issuingCountry: "FRA" }),
    ).toBe(true)
    expect(
      isCredentialAllowed(CredentialScheme.ATTESTED_CAPTURE_IOS, policy, { issuingCountry: "ARE" }),
    ).toBe(false)
    expect(isCredentialAllowed(CredentialScheme.ICAO_CHIP, policy, { issuingCountry: "ARE" })).toBe(
      true,
    )
    const byType: AllowedCredential[] = [
      { scheme: CredentialScheme.ATTESTED_CAPTURE_IOS, documentTypes: ["passport"] },
    ]
    expect(
      isCredentialAllowed(CredentialScheme.ATTESTED_CAPTURE_IOS, byType, {
        documentType: "id_card",
      }),
    ).toBe(false)
    expect(expandAllowedCredentials([rule])).toEqual([
      CredentialScheme.ATTESTED_CAPTURE_IOS,
      CredentialScheme.ATTESTED_CAPTURE_ANDROID,
      CredentialScheme.ATTESTED_CHIP_READ_IOS,
      CredentialScheme.ATTESTED_CHIP_READ_ANDROID,
    ])
  })

  test("rules travel beside the numbers and come back in their place", () => {
    const policy = [CredentialTier.GOVERNMENT_SIGNED, rule]
    expect(serializeAllowedCredentials(policy)).toBe("1,2")
    const rules = serializeCredentialRules(policy)!
    expect(parseCredentialRules(rules)).toEqual([{ scheme: 2, excludeCountries: ["ARE", "IND"] }])
    expect(parseAllowedCredentials("1,2", rules)).toEqual([
      1,
      { scheme: 2, excludeCountries: ["ARE", "IND"] },
    ])
    expect(serializeCredentialRules([1, 200])).toBeUndefined()
    expect(() => parseCredentialRules('[{"scheme":2,"excludeCountries":["India"]}]')).toThrow(
      "alpha-3",
    )
    expect(() => parseCredentialRules('[{"scheme":2}]')).toThrow("at least one limit")
    expect(() => parseCredentialRules('[{"scheme":2,"documentTypes":["visa"]}]')).toThrow(
      "documentTypes",
    )
  })

  test("a rule may not overlap another entry", () => {
    expect(() => validateAllowedCredentials([1, rule])).not.toThrow()
    expect(() => validateAllowedCredentials([2, rule])).toThrow("overlaps")
    expect(() => validateAllowedCredentials([CredentialScheme.ATTESTED_CAPTURE_IOS, rule])).toThrow(
      "overlaps",
    )
    expect(() =>
      validateAllowedCredentials([
        rule,
        { scheme: CredentialScheme.ATTESTED_CAPTURE_IOS, documentTypes: ["passport"] },
      ]),
    ).toThrow("overlaps")
  })

  test("the rule for the ID's scheme is added to the query it proves", () => {
    const query = { age: { gte: 18 }, issuing_country: { out: ["RUS"] } }
    const withRule = applyCredentialPolicyToQuery(query, CredentialScheme.ATTESTED_CAPTURE_IOS, [
      1,
      rule,
    ])
    expect(withRule).toEqual({
      age: { gte: 18 },
      issuing_country: { out: ["ARE", "IND", "RUS"] },
    })
    expect(applyCredentialPolicyToQuery(query, CredentialScheme.ICAO_CHIP, [1, rule])).toBe(query)
    expect(
      applyCredentialPolicyToQuery(
        { issuing_country: { in: ["FRA", "IND"] } },
        CredentialScheme.ATTESTED_CAPTURE_IOS,
        [{ scheme: 2, includeCountries: ["IND", "DEU"] }],
      ),
    ).toEqual({ issuing_country: { in: ["IND"] } })
    expect(
      applyCredentialPolicyToQuery({}, CredentialScheme.ATTESTED_CAPTURE_IOS, [
        { scheme: 2, documentTypes: ["passport"] },
      ]),
    ).toEqual({ document_type: { disclose: true } })
  })
})
