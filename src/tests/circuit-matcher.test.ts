import { Binary } from "../binary"
import { HashAlgorithm, PackagedCertificate, PassportViewModel, Query } from "../types"
import {
  isIDSupported,
  isCscaSupported,
  getCscaForPassport,
  processECDSASignature,
  getDSCCircuitInputs,
  getIDDataCircuitInputs,
  getDSCCountry,
  getIntegrityCheckCircuitInputs,
  getFirstNameRange,
  getLastNameRange,
  getFullNameRange,
  getDiscloseCircuitInputs,
  calculateAge,
  getAgeCircuitInputs,
  getNationalityInclusionCircuitInputs,
  getNationalityExclusionCircuitInputs,
  getIssuingCountryInclusionCircuitInputs,
  getIssuingCountryExclusionCircuitInputs,
  getBirthdateCircuitInputs,
  getExpiryDateCircuitInputs,
} from "../circuit-matcher"
import cscMasterlist from "./fixtures/csc-masterlist.json"
import { rightPadArrayWithZeros, rightPadCountryCodeArray } from "../utils"
import { getCountryWeightedSum } from "../circuits/country"
import { Alpha3Code } from "i18n-iso-countries"
import { ECDSA_PASSPORT, RSA_PASSPORT } from "./fixtures/passports"

describe("Circuit Matcher - General", () => {
  it("should detect if CSCA certificate is supported", () => {
    const certificates = cscMasterlist.certificates
    let totalUnsupported = 0
    for (const certificate of certificates) {
      const result = isCscaSupported(certificate as PackagedCertificate)
      const isUnsupportedHashAlgorithm =
        (certificate.hash_algorithm as HashAlgorithm) === "SHA-1" ||
        (certificate.hash_algorithm as HashAlgorithm) === "SHA-224"
      const isUnsupportedExponent =
        certificate.public_key.type === "RSA" &&
        certificate.public_key.exponent !== 65537 &&
        certificate.public_key.exponent !== 3
      const isUnsupportedKeySize =
        certificate.public_key.type === "RSA" &&
        certificate.public_key.key_size !== 1024 &&
        certificate.public_key.key_size !== 2048 &&
        certificate.public_key.key_size !== 3072 &&
        certificate.public_key.key_size !== 4096
      const isUnsupported =
        isUnsupportedHashAlgorithm || isUnsupportedExponent || isUnsupportedKeySize
      if (isUnsupported) {
        totalUnsupported++
      }
      expect(isUnsupported).toBe(!result)
    }
    console.log(`Total unsupported CSCs: ${totalUnsupported} out of ${certificates.length}`)
  })
})

describe("Circuit Matcher - RSA", () => {
  it("should detected if ID is supported", () => {
    const result = isIDSupported(RSA_PASSPORT)
    expect(result).toBe(true)
  })

  it("should get the correct CSCA for the passport", () => {
    const result = getCscaForPassport(
      RSA_PASSPORT,
      cscMasterlist.certificates as PackagedCertificate[],
    )
    // For now cannot find it since it's not in the masterlist
    // TODO: Add the ZKR certificate to the masterlist
    expect(result).toBe(null)
  })

  it("should get the correct DSC circuit inputs", async () => {
    const result = await getDSCCircuitInputs(
      RSA_PASSPORT,
      1n,
      cscMasterlist.certificates as PackagedCertificate[],
    )
    // TODO: Add the ZKR certificate to the masterlist to make this test pass
    expect(result).toBe(null)
  })

  it("should get the correct ID circuit inputs", async () => {
    const result = await getIDDataCircuitInputs(RSA_PASSPORT, 1n, 1n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      signed_attributes: rightPadArrayWithZeros(RSA_PASSPORT.signedAttributes, 200),
      signed_attributes_size: 104,
      comm_in: "0x21b3541593131c1cb0530f7d0c47fbe68ba340be6b08f9feba5b3481221802e5",
      salt_in: "0x1",
      salt_out: "0x1",
      dsc_pubkey: [
        141, 168, 213, 86, 220, 2, 81, 254, 21, 144, 253, 88, 22, 190, 141, 9, 235, 125, 55, 156,
        11, 18, 142, 94, 74, 120, 34, 216, 229, 19, 235, 70, 98, 165, 224, 74, 239, 175, 236, 201,
        167, 146, 251, 168, 227, 35, 32, 221, 99, 208, 254, 215, 131, 14, 30, 100, 58, 160, 188, 5,
        184, 104, 2, 209, 55, 63, 82, 93, 178, 60, 159, 113, 177, 17, 179, 115, 26, 196, 246, 51,
        50, 26, 160, 174, 129, 173, 124, 194, 95, 121, 123, 30, 14, 210, 174, 212, 208, 44, 21, 115,
        252, 237, 136, 216, 162, 47, 4, 70, 107, 170, 23, 79, 17, 233, 199, 93, 181, 158, 231, 144,
        41, 123, 62, 89, 63, 90, 177, 120, 191, 220, 206, 26, 104, 176, 216, 185, 44, 106, 193, 12,
        89, 221, 233, 85, 27, 119, 184, 167, 175, 33, 216, 183, 82, 72, 83, 26, 85, 202, 70, 244,
        129, 152, 60, 102, 84, 174, 15, 11, 253, 185, 161, 144, 66, 197, 23, 250, 219, 72, 94, 186,
        251, 127, 124, 124, 61, 190, 69, 171, 98, 214, 187, 136, 179, 115, 18, 152, 50, 172, 96,
        238, 199, 142, 246, 255, 136, 36, 230, 150, 216, 24, 148, 139, 29, 208, 59, 102, 29, 126,
        46, 102, 182, 165, 118, 6, 82, 245, 108, 254, 202, 54, 218, 232, 86, 237, 126, 61, 6, 135,
        39, 208, 169, 123, 84, 121, 204, 141, 76, 39, 183, 10, 220, 139, 84, 29, 65, 127,
      ],
      exponent: 65537,
      sod_signature: RSA_PASSPORT.sodSignature,
      dsc_pubkey_redc_param: [
        28, 234, 22, 77, 174, 65, 133, 189, 178, 35, 47, 143, 3, 65, 129, 73, 220, 70, 71, 141, 39,
        238, 224, 161, 52, 174, 19, 153, 160, 1, 20, 117, 117, 45, 20, 17, 11, 177, 245, 179, 63,
        81, 16, 249, 231, 44, 75, 241, 166, 190, 52, 101, 21, 193, 108, 186, 64, 81, 65, 89, 210,
        171, 229, 190, 156, 182, 108, 56, 12, 216, 133, 243, 29, 130, 10, 250, 163, 223, 7, 25, 38,
        236, 223, 64, 135, 210, 253, 206, 250, 44, 234, 191, 132, 95, 232, 3, 167, 212, 17, 94, 165,
        173, 70, 72, 20, 125, 103, 92, 108, 102, 84, 241, 17, 226, 23, 192, 224, 67, 75, 111, 54,
        24, 223, 158, 208, 194, 5, 105, 116, 154, 46, 200, 94, 116, 47, 196, 78, 252, 107, 138, 123,
        116, 77, 177, 167, 159, 117, 146, 157, 115, 134, 19, 113, 225, 227, 76, 30, 4, 130, 94, 232,
        151, 231, 164, 204, 203, 216, 233, 183, 143, 94, 254, 77, 227, 255, 93, 119, 23, 46, 220,
        157, 211, 58, 95, 25, 141, 151, 155, 254, 146, 112, 146, 144, 1, 23, 98, 211, 127, 250, 22,
        61, 155, 232, 40, 44, 223, 188, 123, 12, 88, 45, 206, 182, 100, 151, 195, 41, 101, 229, 25,
        62, 209, 138, 133, 32, 30, 65, 175, 123, 214, 143, 92, 7, 65, 50, 199, 133, 83, 170, 120,
        238, 103, 166, 42, 194, 126, 184, 204, 127, 116, 118, 101, 14, 11, 90, 180, 54,
      ],
      tbs_certificate: rightPadArrayWithZeros(RSA_PASSPORT.tbsCertificate, 700),
      pubkey_offset_in_tbs: 175,
    })
  })

  it("should get the right country code from DSC", () => {
    const result = getDSCCountry(RSA_PASSPORT)
    expect(result).toBe("ZKR")
  })

  it("should get the right integrity check circuit inputs", async () => {
    const result = await getIntegrityCheckCircuitInputs(RSA_PASSPORT, 1n, 1n)
    expect(result).toEqual({
      current_date: "20250423",
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      signed_attributes: rightPadArrayWithZeros(RSA_PASSPORT.signedAttributes, 200),
      signed_attributes_size: 104,
      e_content: rightPadArrayWithZeros(RSA_PASSPORT.eContent, 700),
      e_content_size: 98,
      dg1_offset_in_e_content: 27,
      comm_in: "0x017f8c4025e6b5d2d2ba24f7b858552d257c35d289dfe71da453b40039f2ce78",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      salt_in: "0x1",
      salt_out: "0x1",
    })
  })

  it("should get the correct first name range", () => {
    const result = getFirstNameRange(RSA_PASSPORT)
    expect(result).toEqual([15, 23])
  })

  it("should get the correct last name range", () => {
    const result = getLastNameRange(RSA_PASSPORT)
    // There's overlap with the first name range as the angle brackets are included
    expect(result).toEqual([5, 17])
  })

  it("should get the correct full name range", () => {
    const result = getFullNameRange(RSA_PASSPORT)
    expect(result).toEqual([5, 44])
  })

  it("should get the correct disclose circuit inputs", async () => {
    const query: Query = {
      firstname: { disclose: true },
      lastname: { disclose: true },
      birthdate: { disclose: true },
      nationality: { disclose: true },
      issuing_country: { disclose: true },
    }

    const result = await getDiscloseCircuitInputs(RSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      disclose_mask: [
        0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should calculate the correct age from passport", () => {
    const result = calculateAge(RSA_PASSPORT)
    expect(result).toBe(36)
  })

  it("should get the correct age circuit inputs", async () => {
    const query: Query = {
      age: { gte: 18 },
    }
    const result = await getAgeCircuitInputs(RSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_age_required: 18,
      max_age_required: 0,
    })
  })

  it("should get the correct nationality inclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getNationalityInclusionCircuitInputs(RSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct nationality exclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getNationalityExclusionCircuitInputs(RSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      // Notice how the country code are sorted compared to above
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct issuing country inclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getIssuingCountryInclusionCircuitInputs(RSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct issuing country exclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getIssuingCountryExclusionCircuitInputs(RSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct birthdate circuit inputs", async () => {
    const query: Query = {
      birthdate: { gte: new Date("1980-01-01"), lte: new Date("1990-01-01") },
    }
    const result = await getBirthdateCircuitInputs(RSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_date: "19800101",
      max_date: "19900101",
    })
  })

  it("should get the correct expiry date circuit inputs", async () => {
    const query: Query = {
      expiry_date: { gte: new Date("2025-01-01"), lte: new Date("2035-12-31") },
    }
    const result = await getExpiryDateCircuitInputs(RSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(RSA_PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x082e52412cad18cfb4dc88dca582a76c391464ee57aa434268ccc13e9b1939dd",
      private_nullifier: "0x13df1be6b04c39cd334776ab3b9008f514606c03d4c9aaea6df2485fa1e8555d",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_date: "20250101",
      max_date: "20351231",
    })
  })
})

describe("Circuit Matcher - ECDSA", () => {
  it("should detected if ID is supported", () => {
    const result = isIDSupported(ECDSA_PASSPORT)
    expect(result).toBe(true)
  })

  it("should get the correct CSCA for the passport", () => {
    const result = getCscaForPassport(
      ECDSA_PASSPORT,
      cscMasterlist.certificates as PackagedCertificate[],
    )
    // For now cannot find it since it's not in the masterlist
    // TODO: Add the ZKR certificate to the masterlist
    expect(result).toBe(null)
  })

  it("should get the correct DSC circuit inputs", async () => {
    const result = await getDSCCircuitInputs(
      ECDSA_PASSPORT,
      1n,
      cscMasterlist.certificates as PackagedCertificate[],
    )
    // TODO: Add the ZKR certificate to the masterlist to make this test pass
    expect(result).toBe(null)
  })

  it("should get the correct ID circuit inputs", async () => {
    const result = await getIDDataCircuitInputs(ECDSA_PASSPORT, 1n, 1n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      signed_attributes: rightPadArrayWithZeros(ECDSA_PASSPORT.signedAttributes, 200),
      signed_attributes_size: 137,
      comm_in: "0x242ae93fa8e13604f5437d2133a06d101eeec26aaf4c750d96962fc4bee8cf1f",
      salt_in: "0x1",
      salt_out: "0x1",
      tbs_certificate: rightPadArrayWithZeros(ECDSA_PASSPORT.tbsCertificate, 700),
      pubkey_offset_in_tbs: 163,
      dsc_pubkey_x: [
        146, 99, 75, 11, 193, 227, 101, 12, 26, 238, 91, 244, 179, 18, 50, 38, 26, 72, 243, 202,
        244, 180, 142, 109, 204, 175, 10, 151, 69, 58, 204, 7, 192, 71, 122, 158, 250, 235, 168,
        215, 0, 39, 12, 64, 238, 137, 34, 83,
      ],
      dsc_pubkey_y: [
        135, 139, 103, 68, 80, 2, 216, 195, 34, 157, 107, 195, 39, 187, 244, 1, 181, 82, 127, 187,
        168, 195, 58, 10, 27, 20, 103, 39, 235, 173, 118, 15, 34, 67, 249, 221, 7, 38, 167, 18, 228,
        117, 159, 127, 63, 219, 37, 63,
      ],
      sod_signature: ECDSA_PASSPORT.sodSignature,
    })
  })

  it("should get the right country code from DSC", () => {
    const result = getDSCCountry(ECDSA_PASSPORT)
    expect(result).toBe("ZKR")
  })

  it("should get the right integrity check circuit inputs", async () => {
    const result = await getIntegrityCheckCircuitInputs(ECDSA_PASSPORT, 1n, 1n)
    expect(result).toEqual({
      current_date: "20250423",
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      signed_attributes: rightPadArrayWithZeros(ECDSA_PASSPORT.signedAttributes, 200),
      signed_attributes_size: 137,
      e_content: rightPadArrayWithZeros(ECDSA_PASSPORT.eContent, 700),
      e_content_size: 131,
      dg1_offset_in_e_content: 28,
      comm_in: "0x038889f30e841a9b3a8105e67b49876708345601c60ba2d78575d163905e250e",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      salt_in: "0x1",
      salt_out: "0x1",
    })
  })

  it("should get the correct first name range", () => {
    const result = getFirstNameRange(ECDSA_PASSPORT)
    expect(result).toEqual([15, 23])
  })

  it("should get the correct last name range", () => {
    const result = getLastNameRange(ECDSA_PASSPORT)
    // There's overlap with the first name range as the angle brackets are included
    expect(result).toEqual([5, 17])
  })

  it("should get the correct full name range", () => {
    const result = getFullNameRange(ECDSA_PASSPORT)
    expect(result).toEqual([5, 44])
  })

  it("should get the correct disclose circuit inputs", async () => {
    const query: Query = {
      firstname: { disclose: true },
      lastname: { disclose: true },
      birthdate: { disclose: true },
      nationality: { disclose: true },
      issuing_country: { disclose: true },
    }

    const result = await getDiscloseCircuitInputs(ECDSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      disclose_mask: [
        0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
      comm_in: "0x262053e6c847fe1201c8205ae1a9a7246c4ea2e8b5895420a99351902635a809",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should calculate the correct age from passport", () => {
    const result = calculateAge(ECDSA_PASSPORT)
    expect(result).toBe(36)
  })

  it("should get the correct age circuit inputs", async () => {
    const query: Query = {
      age: { gte: 18 },
    }
    const result = await getAgeCircuitInputs(ECDSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x262053e6c847fe1201c8205ae1a9a7246c4ea2e8b5895420a99351902635a809",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_age_required: 18,
      max_age_required: 0,
    })
  })

  it("should get the correct nationality inclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getNationalityInclusionCircuitInputs(ECDSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x262053e6c847fe1201c8205ae1a9a7246c4ea2e8b5895420a99351902635a809",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct nationality exclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getNationalityExclusionCircuitInputs(ECDSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      // Notice how the country code are sorted compared to above
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x262053e6c847fe1201c8205ae1a9a7246c4ea2e8b5895420a99351902635a809",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct issuing country inclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getIssuingCountryInclusionCircuitInputs(ECDSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x262053e6c847fe1201c8205ae1a9a7246c4ea2e8b5895420a99351902635a809",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct issuing country exclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getIssuingCountryExclusionCircuitInputs(ECDSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x262053e6c847fe1201c8205ae1a9a7246c4ea2e8b5895420a99351902635a809",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
    })
  })

  it("should get the correct birthdate circuit inputs", async () => {
    const query: Query = {
      birthdate: { gte: new Date("1980-01-01"), lte: new Date("1990-01-01") },
    }
    const result = await getBirthdateCircuitInputs(ECDSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x262053e6c847fe1201c8205ae1a9a7246c4ea2e8b5895420a99351902635a809",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_date: "19800101",
      max_date: "19900101",
    })
  })

  it("should get the correct expiry date circuit inputs", async () => {
    const query: Query = {
      expiry_date: { gte: new Date("2025-01-01"), lte: new Date("2035-12-31") },
    }
    const result = await getExpiryDateCircuitInputs(ECDSA_PASSPORT, query, 1n, 2n, 3n)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(ECDSA_PASSPORT.dataGroups[0].value, 95),
      current_date: "20250423",
      comm_in: "0x262053e6c847fe1201c8205ae1a9a7246c4ea2e8b5895420a99351902635a809",
      private_nullifier: "0x2e61c73b0c5c9b235e0ef0b9cc27cc382a3d819e067ef40106f6ca8c2f645702",
      service_scope: "0x2",
      service_subscope: "0x3",
      salt: "0x1",
      min_date: "20250101",
      max_date: "20351231",
    })
  })
})
