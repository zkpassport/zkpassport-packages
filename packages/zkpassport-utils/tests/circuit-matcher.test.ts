import { Alpha3Code } from "i18n-iso-countries"
import {
  calculateAge,
  getAgeCircuitInputs,
  getBirthdateCircuitInputs,
  getCscaForPassportAsync,
  getDSCCircuitInputs,
  getDSCCountry,
  getDiscloseCircuitInputs,
  getExpiryDateCircuitInputs,
  getIDDataCircuitInputs,
  getIntegrityCheckCircuitInputs,
  getIssuingCountryExclusionCircuitInputs,
  getIssuingCountryInclusionCircuitInputs,
  getMrzDisclosedNames,
  getNationalityExclusionCircuitInputs,
  getNationalityInclusionCircuitInputs,
  isCscaSupported,
  isDSCSupported,
  isIDSupported,
} from "../src/circuit-matcher"
import { getCountryWeightedSum } from "../src/circuits/country"
import { PackagedCertificate, PackagedCertificatesFile, Query, SaltedValue } from "../src/types"
import {
  getNowTimestamp,
  getUnixTimestamp,
  rightPadArrayWithZeros,
  rightPadCountryCodeArray,
} from "../src/utils"
import rootCerts from "./fixtures/root-certs-v1.json"
import { getMockPassports } from "../src/mock-passports"
import * as fs from "fs"
import * as path from "path"
import {
  Binary,
  DG1_INPUT_SIZE,
  getCurveName,
  getDSCSignatureHashAlgorithm,
  SIGNED_ATTR_INPUT_SIZE,
  E_CONTENT_INPUT_SIZE,
  getSanctionsExclusionCheckCircuitInputs,
  SanctionsBuilder,
  SECONDS_BETWEEN_1900_AND_1970,
  HASH_ALGORITHM_SHA256,
  OPRF_ZERO_PROOF,
  DisclosedData,
  getDisclosedBytesFromMrzAndMask,
} from "../src"
import { DSC } from "../src/passport/dsc"
import { AsnParser } from "@peculiar/asn1-schema"
import { AuthorityKeyIdentifier } from "@peculiar/asn1-x509"
import { ECParameters } from "@peculiar/asn1-ecc"
import { getFirstNameRange, getFullNameRange, getLastNameRange } from "../src/passport/getters"

const PASSPORTS = getMockPassports()

function getDSCs() {
  const dscDir = path.join(__dirname, "fixtures", "dsc")
  const files = fs.readdirSync(dscDir)

  return files
    .filter((file) => file.endsWith(".der"))
    .map((file) => {
      const filePath = path.join(dscDir, file)
      const content = fs.readFileSync(filePath)
      return DSC.fromDER(Binary.from(content))
    })
}

const EXPECTED_NULLIFIER = "0x188714f640c6c451bf74a33c762ce478b7437135925e38ccae86d7dfbc2058fc"
const EXPECTED_NULLIFIER_ECDSA =
  "0x14727bf01a7869c8814ebac257ba5efdc016b640b62c8014c7199ec0a688a658"

// Global constants
const SALT = 1n
const EXPECTED_SALT = "0x1"
const SERVICE_SCOPE = 2n
const EXPECTED_SERVICE_SCOPE = "0x2"
const SERVICE_SUBSCOPE = 3n
const EXPECTED_SERVICE_SUBSCOPE = "0x3"
const NULLIFIER_SECRET = 0n
const EXPECTED_NULLIFIER_SECRET = "0x0"
const CURRENT_DATE = getNowTimestamp()
const AGE_TEST_DATE = new Date("2026-01-01")

describe("Circuit Matcher - General", () => {
  it("should detect if CSCA certificate is supported", () => {
    const certificates = rootCerts.certificates
    let totalUnsupported = 0
    for (const certificate of certificates) {
      const result = isCscaSupported(certificate as PackagedCertificate)
      const isUnsupportedExponent =
        certificate.public_key.type === "RSA" &&
        certificate.public_key.exponent &&
        certificate.public_key.exponent >= 131072
      const isUnsupportedKeySize =
        certificate.public_key.type === "RSA" &&
        certificate.public_key.key_size !== 1024 &&
        certificate.public_key.key_size !== 2048 &&
        certificate.public_key.key_size !== 3072 &&
        certificate.public_key.key_size !== 4096
      const isUnsupported = isUnsupportedExponent || isUnsupportedKeySize
      if (isUnsupported) {
        totalUnsupported++
      }
      expect(isUnsupported).toBe(!result)
    }
    console.log(`Total unsupported CSCs: ${totalUnsupported} out of ${certificates.length}`)
  })

  // Skipped because it requires the DSC list which is not commited to the repo
  it.skip(
    "should find the CSCs of all the DSCs",
    async () => {
      const dscs = getDSCs()
      const expectedUnknownCSCSubjectKeyIdentifiers = [
        "45728821c8fbff1153455807ad09ed5e868035e8",
        "0654b2b864ec78aa4675f9110634ecdac2a5b4af",
        "a775af64b440e8dd386f2f002280ecedd19d1b97",
      ]
      const unknownCSCSubjectKeyIdentifiers: string[] = []
      const unknownCSCsCountries: string[] = []
      const supportedDSCs: DSC[] = []
      for (const dsc of dscs) {
        if (dsc.tbs.validity.notAfter.getTime() < Date.now()) {
          continue
        }
        const isSupported = isDSCSupported(dsc)
        if (isSupported) {
          supportedDSCs.push(dsc)
        }
        const result = await getCscaForPassportAsync(
          dsc,
          rootCerts.certificates as PackagedCertificate[],
          false,
        )
        if (!result) {
          const akiBuffer = dsc.tbs.extensions.get("authorityKeyIdentifier")?.value.toBuffer()
          if (akiBuffer) {
            const parsed = AsnParser.parse(akiBuffer, AuthorityKeyIdentifier)
            if (parsed?.keyIdentifier?.buffer) {
              const authorityKeyIdentifier = Binary.from(parsed.keyIdentifier.buffer)
                .toHex()
                .replace("0x", "")
              unknownCSCSubjectKeyIdentifiers.push(authorityKeyIdentifier)
            }
          }
          const country = getDSCCountry(dsc)
          if (country) {
            unknownCSCsCountries.push(country)
          }
        }
      }
      console.log(
        `Total DSCs without known CSCs: ${unknownCSCSubjectKeyIdentifiers.length} out of ${dscs.length}`,
      )
      const uniqueUnknownCSCSubjectKeyIdentifiers = Array.from(
        new Set(unknownCSCSubjectKeyIdentifiers),
      )
      const uniqueUnknownCSCsCountries = Array.from(new Set(unknownCSCsCountries))
      console.log(
        `Total unique unknown CSC subject key identifiers: ${uniqueUnknownCSCSubjectKeyIdentifiers.length}`,
      )
      console.log(JSON.stringify(uniqueUnknownCSCSubjectKeyIdentifiers))
      console.log(`Total unique unknown CSC countries: ${uniqueUnknownCSCsCountries.length}`)
      console.log(JSON.stringify(uniqueUnknownCSCsCountries))
      console.log(
        `Hash algorithms: ${JSON.stringify(Array.from(new Set(supportedDSCs.map((x) => getDSCSignatureHashAlgorithm(x)))))}`,
      )
      console.log(
        `Signature algorithms: ${JSON.stringify(
          Array.from(new Set(supportedDSCs.map((x) => x.signatureAlgorithm.name))),
        )}`,
      )
      console.log(
        `Curves: ${JSON.stringify(
          Array.from(
            new Set(
              supportedDSCs.map((x) =>
                x.tbs.subjectPublicKeyInfo.signatureAlgorithm.name.toLowerCase().includes("ec") &&
                x.tbs.subjectPublicKeyInfo.signatureAlgorithm.parameters &&
                x.tbs.subjectPublicKeyInfo.signatureAlgorithm.parameters.toBuffer().length > 0
                  ? getCurveName(
                      AsnParser.parse(
                        x.tbs.subjectPublicKeyInfo.signatureAlgorithm.parameters.toBuffer(),
                        ECParameters,
                      ),
                    )
                  : "",
              ),
            ),
          ),
        )}`,
      )
      console.log(`Total supported DSCs: ${supportedDSCs.length}`)
      console.log(
        JSON.stringify(Array.from(new Set(supportedDSCs.map((x) => getDSCCountry(x)))).sort()),
      )
      expect(uniqueUnknownCSCSubjectKeyIdentifiers).toEqual(expectedUnknownCSCSubjectKeyIdentifiers)
    },
    10 * 60000,
  )
})

describe("Circuit Matcher - RSA", () => {
  it("should detected if ID is supported", () => {
    const result = isIDSupported(PASSPORTS.john)
    expect(result).toBe(true)
  })

  it("should get the correct CSCA for the passport", async () => {
    const result = await getCscaForPassportAsync(
      PASSPORTS.john.sod.certificate,
      rootCerts.certificates as PackagedCertificate[],
    )
    expect(result).toEqual(
      rootCerts.certificates.find((x) => x.country === "ZKR" && x.signature_algorithm === "RSA"),
    )
  })

  it("should get the same DSC circuit inputs when the file has no stored tree", async () => {
    const withoutTree = { ...rootCerts, certificates_serialised: undefined }
    expect(
      await getDSCCircuitInputs(
        PASSPORTS.john,
        SALT,
        withoutTree as unknown as PackagedCertificatesFile,
      ),
    ).toEqual(
      await getDSCCircuitInputs(
        PASSPORTS.john,
        SALT,
        rootCerts as unknown as PackagedCertificatesFile,
      ),
    )
  })

  it("should get the correct DSC circuit inputs (v1)", async () => {
    const result = await getDSCCircuitInputs(
      PASSPORTS.john,
      SALT,
      rootCerts as unknown as PackagedCertificatesFile,
    )
    expect(result).toEqual({
      certificate_registry_root:
        "0x2e31e60b172bbbef37071cfdf0868a719ef5915889ac8aa569079a7024646beb",
      schema_version: 1,
      timestamp: 1777479919,
      certificate_tree_index: 58,
      certificate_tree_hash_path: [
        "0x06f2199ef234deaa4520c258449bf237ab806af48a712dee92de2650790d3900",
        "0x1bad03d629ab2dfba81c876504a1f3d7dfcc4b1e2b63290fb6884e079044d14a",
        "0x11112d24b8b00d5cb4c7b9500fab7fbfe15957d89dde26b597bb057bd28d76ff",
        "0x10c35f3a3d7e271c2a9c0c749ab7a76c0a4b5c1530735dd5d998ff98601b908d",
        "0x0b78cbdc0d1fa4562fe02bb3dd87646653ed7be964aca72438c7277bbf63c925",
        "0x142b9df6debe700863e5918a1668d89b2e6628d283500b54795a2ac94ac93c20",
        "0x10e832d41b85edd8011807afd0b7c191779706b4ae7f9415af6c88f0058d9cc8",
        "0x1a69a25d7b30b15536ddab5e97e9e9949ce2fd76160a086ebdfdf655dae00e30",
        "0x0952b729198e5022c82d955334d10d78529231113f43717952de782da604f1eb",
        "0x0eea4b8543612a163faf06cfb528f58d8f814b166083333adac8912a26e805e5",
        "0x2a775ea761d20435b31fa2c33ff07663e24542ffb9e7b293dfce3042eb104686",
        "0x0f320b0703439a8114f81593de99cd0b8f3b9bf854601abb5b2ea0e8a3dda4a7",
        "0x0d07f6e7a8a0e9199d6d92801fff867002ff5b4808962f9da2ba5ce1bdd26a73",
        "0x1c4954081e324939350febc2b918a293ebcdaead01be95ec02fcbe8d2c1635d1",
        "0x0197f2171ef99c2d053ee1fb5ff5ab288d56b9b41b4716c9214a4d97facc4c4a",
        "0x2b9cdd484c5ba1e4d6efcc3f18734b5ac4c4a0b9102e2aeb48521a661d3feee9",
      ],
      certificate_tags: ["0x0", "0x0", "0x80000000000000000000000000000"],
      certificate_type: "0x1",
      country: "ZKR",
      csc_expiry: 2061209141,
      csc_fingerprint: "0x0dd2bf5d3816bb67f72edea08f534c00eb2ce039578a4e012d6892e28187db62",
      revocation_tree_root: "0x0197f2171ef99c2d053ee1fb5ff5ab288d56b9b41b4716c9214a4d97facc4c4a",
      masterlist_tree_root: "0x23018223bd4413ac3342f1affbd3efe17b73d247ddc24de02915437b13e02f01",
      salt: EXPECTED_SALT,
      tbs_certificate: rightPadArrayWithZeros(
        PASSPORTS.john.sod.certificate.tbs.bytes.toNumberArray(),
        700,
      ),
      dsc_signature: PASSPORTS.john.sod.certificate.signature.toNumberArray(),
      csc_pubkey: [
        248, 49, 245, 49, 134, 64, 78, 179, 47, 178, 82, 126, 19, 229, 209, 152, 237, 167, 236, 246,
        86, 119, 34, 191, 211, 111, 112, 65, 64, 49, 155, 81, 182, 44, 213, 36, 96, 11, 21, 152,
        125, 87, 98, 168, 153, 235, 210, 91, 60, 52, 184, 27, 37, 251, 204, 230, 20, 150, 76, 232,
        197, 14, 167, 228, 71, 67, 240, 125, 36, 160, 247, 102, 173, 50, 18, 83, 19, 128, 107, 149,
        217, 101, 75, 73, 55, 192, 6, 169, 226, 236, 45, 61, 45, 216, 231, 100, 224, 60, 127, 20,
        29, 216, 139, 49, 90, 240, 86, 74, 138, 30, 107, 136, 44, 149, 77, 157, 100, 226, 121, 137,
        50, 254, 91, 179, 211, 46, 138, 46, 148, 188, 31, 105, 192, 93, 103, 183, 49, 179, 153, 43,
        2, 21, 45, 66, 240, 210, 139, 64, 22, 188, 116, 116, 202, 150, 53, 116, 170, 160, 103, 112,
        87, 95, 235, 110, 223, 155, 180, 154, 218, 151, 198, 160, 210, 27, 136, 236, 7, 92, 75, 139,
        172, 52, 194, 4, 182, 98, 95, 191, 216, 250, 166, 238, 206, 60, 145, 235, 5, 228, 40, 205,
        119, 118, 128, 141, 16, 174, 210, 232, 116, 182, 26, 80, 29, 192, 184, 139, 115, 250, 83,
        115, 175, 96, 53, 5, 45, 153, 147, 192, 89, 193, 173, 15, 138, 250, 69, 130, 221, 180, 182,
        175, 212, 84, 17, 99, 184, 221, 3, 182, 43, 64, 87, 73, 218, 234, 77, 87,
      ],
      csc_pubkey_redc_param: [
        66, 3, 55, 231, 176, 109, 247, 30, 50, 100, 94, 91, 179, 81, 45, 79, 181, 19, 96, 155, 81,
        227, 155, 168, 192, 62, 219, 48, 116, 242, 15, 218, 163, 31, 110, 80, 254, 153, 33, 33, 42,
        146, 146, 208, 251, 21, 12, 177, 209, 31, 74, 245, 234, 223, 99, 75, 183, 122, 236, 33, 56,
        204, 132, 33, 61, 138, 33, 210, 132, 254, 82, 8, 150, 219, 60, 165, 28, 79, 236, 24, 138,
        11, 108, 65, 188, 239, 180, 235, 221, 82, 72, 149, 21, 14, 207, 195, 111, 172, 181, 18, 11,
        177, 168, 10, 53, 214, 157, 252, 172, 242, 93, 176, 202, 81, 4, 185, 159, 81, 28, 68, 77,
        167, 131, 171, 183, 89, 154, 251, 98, 140, 47, 100, 134, 245, 234, 210, 22, 193, 104, 11,
        93, 38, 10, 163, 124, 7, 22, 131, 29, 236, 202, 40, 8, 63, 156, 17, 177, 15, 212, 78, 27,
        127, 120, 165, 42, 112, 206, 115, 104, 44, 9, 94, 191, 27, 209, 151, 194, 155, 132, 146,
        193, 5, 88, 192, 255, 209, 240, 157, 91, 190, 250, 183, 168, 87, 12, 83, 33, 35, 80, 169,
        216, 85, 35, 49, 79, 72, 21, 37, 59, 101, 184, 100, 23, 47, 171, 163, 27, 144, 159, 13, 254,
        254, 13, 82, 159, 223, 62, 250, 48, 137, 144, 72, 231, 102, 179, 151, 59, 29, 253, 21, 202,
        180, 73, 209, 86, 77, 186, 190, 2, 182, 195, 171, 170, 207, 162, 128, 224,
      ],
      exponent: 65537,
      pss_salt_len: 0,
    })
  })

  it("should get the correct ID circuit inputs", async () => {
    const result = await getIDDataCircuitInputs(PASSPORTS.john, SALT, SALT)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, DG1_INPUT_SIZE),
      signed_attributes: rightPadArrayWithZeros(
        PASSPORTS.john.sod.signerInfo.signedAttrs.bytes.toNumberArray(),
        SIGNED_ATTR_INPUT_SIZE,
      ),
      comm_in: "0x2a0c6e4563e17672e7bab5313dc15478423d5a0c63e2bb58fbb0ae7eef78bcd2",
      salt_in: EXPECTED_SALT,
      salt_out: EXPECTED_SALT,
      dsc_pubkey: [
        201, 44, 130, 82, 205, 147, 218, 112, 240, 185, 82, 8, 23, 169, 25, 163, 199, 143, 72, 96,
        147, 144, 2, 6, 254, 171, 90, 217, 9, 49, 79, 19, 207, 218, 51, 201, 32, 130, 137, 148, 173,
        142, 123, 96, 240, 228, 61, 252, 172, 186, 37, 39, 190, 209, 19, 103, 201, 120, 114, 50,
        212, 110, 221, 243, 18, 147, 92, 229, 17, 10, 86, 72, 251, 155, 225, 149, 79, 186, 168, 67,
        180, 158, 80, 26, 124, 221, 184, 42, 145, 192, 14, 2, 58, 28, 89, 119, 117, 183, 224, 121,
        208, 71, 159, 21, 81, 10, 249, 173, 182, 86, 242, 101, 234, 81, 43, 226, 4, 54, 23, 47, 118,
        248, 83, 177, 140, 19, 224, 175, 179, 6, 209, 228, 7, 158, 189, 10, 130, 247, 34, 209, 132,
        4, 226, 156, 84, 150, 241, 85, 63, 55, 169, 38, 159, 43, 92, 140, 179, 86, 19, 193, 242, 80,
        213, 184, 28, 52, 40, 178, 16, 79, 87, 147, 89, 68, 117, 176, 231, 81, 90, 214, 219, 236,
        21, 99, 27, 58, 194, 124, 162, 114, 5, 8, 243, 22, 128, 178, 39, 80, 80, 138, 113, 106, 8,
        103, 36, 196, 165, 65, 205, 116, 31, 212, 0, 32, 202, 21, 55, 180, 174, 164, 51, 242, 143,
        62, 193, 160, 31, 96, 168, 205, 12, 67, 117, 212, 198, 145, 144, 35, 179, 228, 71, 0, 235,
        232, 115, 52, 10, 83, 138, 227, 69, 222, 138, 129, 209, 237,
      ],
      exponent: 65537,
      sod_signature: PASSPORTS.john.sod.signerInfo.signature.toNumberArray(),
      dsc_pubkey_redc_param: [
        81, 113, 38, 83, 144, 152, 145, 188, 111, 28, 124, 53, 118, 210, 153, 73, 1, 21, 75, 192,
        250, 32, 88, 172, 46, 143, 50, 119, 91, 175, 224, 47, 213, 231, 168, 215, 131, 214, 233, 51,
        27, 53, 1, 251, 70, 54, 188, 225, 254, 237, 70, 162, 34, 129, 106, 212, 252, 245, 106, 35,
        191, 12, 36, 26, 58, 112, 5, 229, 153, 247, 37, 75, 224, 200, 227, 31, 223, 172, 125, 134,
        45, 202, 211, 149, 219, 125, 26, 68, 58, 125, 183, 251, 151, 1, 3, 185, 9, 0, 107, 90, 18,
        16, 29, 42, 230, 102, 91, 118, 33, 112, 184, 85, 29, 2, 226, 102, 176, 59, 61, 231, 120,
        253, 129, 191, 166, 209, 91, 123, 171, 73, 54, 68, 171, 45, 97, 255, 190, 2, 141, 7, 170,
        55, 44, 128, 207, 24, 150, 193, 187, 208, 80, 114, 240, 19, 156, 192, 180, 99, 16, 96, 40,
        4, 134, 99, 14, 150, 75, 74, 206, 50, 247, 53, 123, 189, 219, 222, 66, 225, 89, 253, 119,
        123, 177, 221, 78, 12, 154, 123, 92, 40, 203, 249, 65, 117, 120, 32, 49, 159, 86, 104, 193,
        240, 55, 247, 119, 100, 168, 230, 168, 129, 167, 82, 108, 213, 37, 197, 55, 31, 61, 128,
        126, 91, 208, 109, 91, 28, 205, 159, 24, 126, 228, 169, 55, 228, 89, 122, 73, 214, 137, 19,
        206, 70, 58, 71, 34, 34, 68, 139, 239, 226, 153, 116, 60, 139, 16, 165, 249,
      ],
      tbs_certificate: rightPadArrayWithZeros(
        PASSPORTS.john.sod.certificate.tbs.bytes.toNumberArray(),
        700,
      ),
      e_content: rightPadArrayWithZeros(
        PASSPORTS.john.sod.encapContentInfo.eContent.bytes.toNumberArray(),
        E_CONTENT_INPUT_SIZE,
      ),
      pss_salt_len: 0,
    })
  })

  it("should get the right country code from DSC", () => {
    const result = getDSCCountry(PASSPORTS.john.sod.certificate)
    expect(result).toBe("ZKR")
  })

  it("should get the right integrity check circuit inputs", async () => {
    const result = await getIntegrityCheckCircuitInputs(PASSPORTS.john, SALT, {
      dg1Salt: SALT,
      expiryDateSalt: SALT,
      dg2HashSalt: SALT,
      privateNullifierSalt: SALT,
    })
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, 95),
      ).formatForInput(),
      signed_attributes: rightPadArrayWithZeros(
        PASSPORTS.john.sod.signerInfo.signedAttrs.bytes.toNumberArray(),
        256,
      ),
      e_content: rightPadArrayWithZeros(
        PASSPORTS.john.sod.encapContentInfo.eContent.bytes.toNumberArray(),
        700,
      ),
      comm_in: "0x02fa901bd9c613e8a35c0725df7015e218c324bd00a95e3aaa11c6c9c48631f7",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      expiry_date_salt: `0x${SALT.toString(16)}`,
      dg2_hash_salt: `0x${SALT.toString(16)}`,
      salt_in: EXPECTED_SALT,
    })
  })

  it("should get the correct first name range", () => {
    const result = getFirstNameRange(PASSPORTS.john)
    expect(result).toEqual([10, 16])
  })

  it("should get the correct last name range", () => {
    const result = getLastNameRange(PASSPORTS.john)
    // There's overlap with the first name range as the angle brackets are included
    expect(result).toEqual([5, 12])
  })

  it("should get the correct full name range", () => {
    const result = getFullNameRange(PASSPORTS.john)
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

    const result = await getDiscloseCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, 95),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.john.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      disclose_mask: [
        0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
      comm_in: "0x0da83b7dfb7943772e3ca354e8c6e9ad93cb42a5e40c0df9c93b1d99e6007e95",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("getMrzDisclosedNames matches the verifier's parsing of the real proof mask", async () => {
    const query: Query = {
      firstname: { disclose: true },
      lastname: { disclose: true },
      birthdate: { disclose: true },
      nationality: { disclose: true },
      issuing_country: { disclose: true },
    }
    const inputs = await getDiscloseCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    const disclosedBytes = getDisclosedBytesFromMrzAndMask(
      PASSPORTS.john.mrz,
      inputs!.disclose_mask,
    )
    const fromProof = DisclosedData.fromDisclosedBytes(disclosedBytes, "passport")
    const fromHelper = getMrzDisclosedNames(PASSPORTS.john, query)

    expect(fromHelper.firstName).toEqual(fromProof.firstName)
    expect(fromHelper.lastName).toEqual(fromProof.lastName)
    expect(fromHelper.firstName).toBe("JOHN")
    expect(fromHelper.lastName).toBe("SMITH")
  })

  it("should calculate the correct age from passport", () => {
    const result = calculateAge(PASSPORTS.john, AGE_TEST_DATE)
    expect(result).toBe(30)
  })

  it("should get the correct age circuit inputs", async () => {
    const query: Query = {
      age: { gte: 18 },
    }
    const timestamp = getNowTimestamp()
    const result = await getAgeCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      timestamp,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, 95),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.john.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: timestamp,
      comm_in: "0x0da83b7dfb7943772e3ca354e8c6e9ad93cb42a5e40c0df9c93b1d99e6007e95",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      min_age_required: 18,
      max_age_required: 0,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct nationality inclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getNationalityInclusionCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.john.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x0da83b7dfb7943772e3ca354e8c6e9ad93cb42a5e40c0df9c93b1d99e6007e95",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct nationality exclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getNationalityExclusionCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.john.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      // Notice how the country code are sorted compared to above
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x0da83b7dfb7943772e3ca354e8c6e9ad93cb42a5e40c0df9c93b1d99e6007e95",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct issuing country inclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getIssuingCountryInclusionCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.john.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x0da83b7dfb7943772e3ca354e8c6e9ad93cb42a5e40c0df9c93b1d99e6007e95",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct issuing country exclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getIssuingCountryExclusionCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.john.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x0da83b7dfb7943772e3ca354e8c6e9ad93cb42a5e40c0df9c93b1d99e6007e95",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct birthdate circuit inputs", async () => {
    const query: Query = {
      birthdate: { gte: new Date("1980-01-01"), lte: new Date("1990-01-01") },
    }
    const timestamp = getNowTimestamp()
    const result = await getBirthdateCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      timestamp,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.john.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: timestamp,
      comm_in: "0x0da83b7dfb7943772e3ca354e8c6e9ad93cb42a5e40c0df9c93b1d99e6007e95",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      min_date: getUnixTimestamp(new Date("1980-01-01")) + SECONDS_BETWEEN_1900_AND_1970,
      max_date: getUnixTimestamp(new Date("1990-01-01")) + SECONDS_BETWEEN_1900_AND_1970,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct expiry date circuit inputs", async () => {
    const query: Query = {
      expiry_date: { gte: new Date("2025-01-01"), lte: new Date("2035-12-31") },
    }
    const timestamp = getNowTimestamp()
    const result = await getExpiryDateCircuitInputs(
      PASSPORTS.john,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      timestamp,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.john.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.john.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: timestamp,
      comm_in: "0x0da83b7dfb7943772e3ca354e8c6e9ad93cb42a5e40c0df9c93b1d99e6007e95",
      salted_private_nullifier: SaltedValue.fromValue(SALT, EXPECTED_NULLIFIER).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      min_date: getUnixTimestamp(new Date("2025-01-01")),
      max_date: getUnixTimestamp(new Date("2035-12-31")),
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })
})

describe("Circuit Matcher - ECDSA", () => {
  it("should detected if ID is supported", () => {
    const result = isIDSupported(PASSPORTS.mary)
    expect(result).toBe(true)
  })

  it("should get the correct CSCA for the passport", async () => {
    const result = await getCscaForPassportAsync(
      PASSPORTS.mary.sod.certificate,
      rootCerts.certificates as PackagedCertificate[],
    )
    expect(result).toEqual(
      rootCerts.certificates.find((x) => x.country === "ZKR" && x.signature_algorithm === "ECDSA"),
    )
  })

  it("should get the correct DSC circuit inputs (v1)", async () => {
    const result = await getDSCCircuitInputs(
      PASSPORTS.mary,
      SALT,
      rootCerts as unknown as PackagedCertificatesFile,
    )
    expect(result).toEqual({
      certificate_registry_root:
        "0x2e31e60b172bbbef37071cfdf0868a719ef5915889ac8aa569079a7024646beb",
      schema_version: 1,
      timestamp: 1777479919,
      certificate_tree_index: 449,
      certificate_tree_hash_path: [
        "0x27ae678cdb6b674c1546b059d49e3f8bba9352a5dad2d4bc03bc74cc5d341fa5",
        "0x11608995fd95f128bbbfff2c8f7b63fdf415ef9a697a67bdd65a7eed2a6470f7",
        "0x0b4e02f9cd11836ea25d95ef6a19ffe0a09b54f90c5f18f97e04acc0d95e7d42",
        "0x250ec5b49b5e4c84a828701bb9a7802eede1c7c8bc89353e3e690bc649195751",
        "0x097a5ff36adbfebcc9ede200fce54fd06f3797a287ed88cb1931a13b6fb08374",
        "0x1dd262044d4c3f9d228cc5a5af4af10844bd6611af3b1f9f1d1c608aa2785067",
        "0x1b6e36ec3d3c85fa98efde0703363ec2f18ceb692676d20ab92530c2626dfffc",
        "0x2b2ef19c1a13651b00de3a5ea0cad2278c3b5cffe68a100110c4b907b61e88db",
        "0x2994751fabd15f4159d5009a2c95aa4a1525e14b6f1456ccaa5e5e858c7b2ba6",
        "0x0eea4b8543612a163faf06cfb528f58d8f814b166083333adac8912a26e805e5",
        "0x2a775ea761d20435b31fa2c33ff07663e24542ffb9e7b293dfce3042eb104686",
        "0x0f320b0703439a8114f81593de99cd0b8f3b9bf854601abb5b2ea0e8a3dda4a7",
        "0x0d07f6e7a8a0e9199d6d92801fff867002ff5b4808962f9da2ba5ce1bdd26a73",
        "0x1c4954081e324939350febc2b918a293ebcdaead01be95ec02fcbe8d2c1635d1",
        "0x0197f2171ef99c2d053ee1fb5ff5ab288d56b9b41b4716c9214a4d97facc4c4a",
        "0x2b9cdd484c5ba1e4d6efcc3f18734b5ac4c4a0b9102e2aeb48521a661d3feee9",
      ],
      certificate_tags: ["0x0", "0x0", "0x80000000000000000000000000000"],
      certificate_type: "0x1",
      country: "ZKR",
      csc_expiry: 2061209142,
      csc_fingerprint: "0x0a5ff627895f7b54499fb864b0250acfd5f209cb2934af4d964e862a67d01010",
      revocation_tree_root: "0x0197f2171ef99c2d053ee1fb5ff5ab288d56b9b41b4716c9214a4d97facc4c4a",
      masterlist_tree_root: "0x23018223bd4413ac3342f1affbd3efe17b73d247ddc24de02915437b13e02f01",
      salt: EXPECTED_SALT,
      csc_pubkey_x: [
        100, 67, 3, 43, 184, 208, 212, 7, 28, 252, 194, 241, 65, 191, 163, 215, 48, 51, 138, 76,
        143, 69, 163, 224, 28, 89, 218, 77, 111, 77, 145, 220,
      ],
      csc_pubkey_y: [
        174, 84, 95, 24, 151, 163, 101, 170, 23, 62, 235, 85, 217, 12, 135, 137, 23, 129, 89, 160,
        8, 154, 151, 127, 22, 55, 93, 197, 145, 218, 255, 163,
      ],
      dsc_signature: [
        240, 148, 90, 148, 186, 150, 134, 224, 37, 229, 199, 98, 242, 202, 140, 38, 88, 5, 126, 125,
        193, 121, 234, 127, 192, 77, 199, 152, 172, 215, 134, 55, 94, 128, 11, 135, 3, 73, 180, 55,
        44, 125, 41, 157, 161, 17, 152, 86, 7, 81, 249, 177, 199, 92, 121, 105, 238, 236, 114, 145,
        184, 83, 14, 191,
      ],
      tbs_certificate: rightPadArrayWithZeros(
        PASSPORTS.mary.sod.certificate.tbs.bytes.toNumberArray(),
        700,
      ),
    })
  })

  it("should get the correct ID circuit inputs", async () => {
    const result = await getIDDataCircuitInputs(PASSPORTS.mary, SALT, SALT)
    expect(result).toEqual({
      dg1: rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      signed_attributes: rightPadArrayWithZeros(
        PASSPORTS.mary.sod.signerInfo.signedAttrs.bytes.toNumberArray(),
        SIGNED_ATTR_INPUT_SIZE,
      ),
      comm_in: "0x12e897c77698f0769a718ac56e002dee93b4bb292a690547e097a8511f7b7ca5",
      salt_in: EXPECTED_SALT,
      salt_out: EXPECTED_SALT,
      tbs_certificate: rightPadArrayWithZeros(
        PASSPORTS.mary.sod.certificate.tbs.bytes.toNumberArray(),
        700,
      ),
      dsc_pubkey_x: [
        95, 20, 62, 235, 192, 28, 84, 227, 8, 38, 76, 65, 88, 224, 236, 197, 71, 131, 209, 164, 6,
        24, 157, 163, 82, 166, 21, 8, 184, 94, 246, 112,
      ],
      dsc_pubkey_y: [
        108, 236, 60, 159, 135, 142, 23, 110, 33, 71, 172, 92, 170, 214, 2, 230, 225, 16, 119, 251,
        105, 16, 212, 111, 82, 98, 51, 128, 176, 5, 198, 194,
      ],
      sod_signature: [
        223, 64, 250, 6, 59, 10, 128, 135, 40, 146, 25, 44, 240, 67, 70, 16, 162, 53, 246, 151, 153,
        76, 211, 5, 105, 172, 99, 159, 176, 75, 215, 170, 11, 25, 193, 173, 84, 56, 242, 29, 165,
        11, 207, 171, 66, 118, 34, 162, 44, 70, 249, 1, 220, 33, 199, 32, 211, 62, 48, 118, 214,
        233, 95, 13,
      ],
      e_content: rightPadArrayWithZeros(
        PASSPORTS.mary.sod.encapContentInfo.eContent.bytes.toNumberArray(),
        E_CONTENT_INPUT_SIZE,
      ),
    })
  })

  it("should get the right country code from DSC", () => {
    const result = getDSCCountry(PASSPORTS.mary.sod.certificate)
    expect(result).toBe("ZKR")
  })

  it("should get the right integrity check circuit inputs", async () => {
    const result = await getIntegrityCheckCircuitInputs(PASSPORTS.mary, SALT, {
      dg1Salt: SALT,
      expiryDateSalt: SALT,
      dg2HashSalt: SALT,
      privateNullifierSalt: SALT,
    })
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      signed_attributes: rightPadArrayWithZeros(
        PASSPORTS.mary.sod.signerInfo.signedAttrs.bytes.toNumberArray(),
        SIGNED_ATTR_INPUT_SIZE,
      ),
      e_content: rightPadArrayWithZeros(
        PASSPORTS.mary.sod.encapContentInfo.eContent.bytes.toNumberArray(),
        E_CONTENT_INPUT_SIZE,
      ),
      comm_in: "0x2266810817da3a8c719fdd7f710d5c8a249ea4bea2f086215103d6d46ed336b6",
      expiry_date_salt: `0x${SALT.toString(16)}`,
      dg2_hash_salt: `0x${SALT.toString(16)}`,
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salt_in: EXPECTED_SALT,
    })
  })

  it("should get the correct first name range", () => {
    const result = getFirstNameRange(PASSPORTS.mary)
    expect(result).toEqual([10, 16])
  })

  it("should get the correct last name range", () => {
    const result = getLastNameRange(PASSPORTS.mary)
    // There's overlap with the first name range as the angle brackets are included
    expect(result).toEqual([5, 12])
  })

  it("should get the correct full name range", () => {
    const result = getFullNameRange(PASSPORTS.mary)
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

    const result = await getDiscloseCircuitInputs(
      PASSPORTS.mary,
      query,
      {
        dg1Salt: SALT,
        expiryDateSalt: SALT,
        dg2HashSalt: SALT,
        privateNullifierSalt: SALT,
      },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      disclose_mask: [
        0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ],
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should calculate the correct age from passport", () => {
    const result = calculateAge(PASSPORTS.mary, AGE_TEST_DATE)
    expect(result).toBe(50)
  })

  it("should get the correct age circuit inputs", async () => {
    const query: Query = {
      age: { gte: 18 },
    }
    const result = await getAgeCircuitInputs(
      PASSPORTS.mary,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      min_age_required: 18,
      max_age_required: 0,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct nationality inclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getNationalityInclusionCircuitInputs(
      PASSPORTS.mary,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct nationality exclusion circuit inputs", async () => {
    const query: Query = {
      nationality: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getNationalityExclusionCircuitInputs(
      PASSPORTS.mary,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      // Notice how the country code are sorted compared to above
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct issuing country inclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { in: ["ZKR", "FRA", "GBR", "USA"] },
    }
    const result = await getIssuingCountryInclusionCircuitInputs(
      PASSPORTS.mary,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      country_list: rightPadCountryCodeArray(["ZKR", "FRA", "GBR", "USA"], 200),
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct issuing country exclusion circuit inputs", async () => {
    const query: Query = {
      issuing_country: { out: ["FRA", "USA", "GBR"] },
    }
    const result = await getIssuingCountryExclusionCircuitInputs(
      PASSPORTS.mary,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      country_list: rightPadCountryCodeArray(["FRA", "GBR", "USA"], 200).map((country) =>
        getCountryWeightedSum(country as Alpha3Code),
      ),
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct birthdate circuit inputs", async () => {
    const query: Query = {
      birthdate: { gte: new Date("1980-01-01"), lte: new Date("1990-01-01") },
    }
    const timestamp = getNowTimestamp()
    const result = await getBirthdateCircuitInputs(
      PASSPORTS.mary,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      timestamp,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: timestamp,
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      min_date: getUnixTimestamp(new Date("1980-01-01")) + SECONDS_BETWEEN_1900_AND_1970,
      max_date: getUnixTimestamp(new Date("1990-01-01")) + SECONDS_BETWEEN_1900_AND_1970,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct expiry date circuit inputs", async () => {
    const query: Query = {
      expiry_date: { gte: new Date("2025-01-01"), lte: new Date("2035-12-31") },
    }
    const timestamp = getNowTimestamp()
    const result = await getExpiryDateCircuitInputs(
      PASSPORTS.mary,
      query,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      timestamp,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: timestamp,
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      min_date: getUnixTimestamp(new Date("2025-01-01")),
      max_date: getUnixTimestamp(new Date("2035-12-31")),
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  })

  it("should get the correct sanctions exclusion check circuit inputs", async () => {
    // TODO: Download serialised sanctions tree from a CDN via a test script in advance and remove 30s timeout
    const sanctions = await SanctionsBuilder.create()
    const { proofs, root } = await sanctions.getSanctionsMerkleProofs(PASSPORTS.mary, true)
    const result = await getSanctionsExclusionCheckCircuitInputs(
      PASSPORTS.mary,
      true,
      { dg1Salt: SALT, expiryDateSalt: SALT, dg2HashSalt: SALT, privateNullifierSalt: SALT },
      NULLIFIER_SECRET,
      SERVICE_SCOPE,
      SERVICE_SUBSCOPE,
      CURRENT_DATE,
      undefined, // oprfProof
      sanctions,
    )
    expect(result).toEqual({
      salted_dg1: SaltedValue.fromValue(
        SALT,
        rightPadArrayWithZeros(PASSPORTS.mary.dataGroups[0].value, DG1_INPUT_SIZE),
      ).formatForInput(),
      salted_expiry_date: SaltedValue.fromValue(
        SALT,
        PASSPORTS.mary.passportExpiry.split("").map((char) => char.charCodeAt(0)),
      ).formatForInput(),
      current_date: CURRENT_DATE,
      is_strict: 1,
      comm_in: "0x0285d260712fdebb60a20d4e31ee55aa4e08e31f46c4bfa5670c4843ecb19f33",
      salted_private_nullifier: SaltedValue.fromValue(
        SALT,
        EXPECTED_NULLIFIER_ECDSA,
      ).formatForInput(),
      salted_dg2_hash: SaltedValue.fromValue(
        SALT,
        "0x13d6975513069f41c10b22aa678c090ba2093e4879aab1f2fc9a20a096b7a65f",
      ).formatForInput(),
      salted_dg2_hash_type: SaltedValue.fromValue(SALT, HASH_ALGORITHM_SHA256).formatForInput(),
      root: root,
      proofs,
      service_scope: EXPECTED_SERVICE_SCOPE,
      service_subscope: EXPECTED_SERVICE_SUBSCOPE,
      nullifier_secret: EXPECTED_NULLIFIER_SECRET,
      oprf_proof: OPRF_ZERO_PROOF,
    })
  }, 30000)
})
