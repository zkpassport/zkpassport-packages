import { Binary, SOD, type PassportViewModel } from "@zkpassport/utils"
import johnSODJson from "./fixtures/john-miller-smith-rsa-2048-sha256.json"

/**
 * John Miller Smith, a ZKR mock passport (RSA-2048 DSC, SHA-256), built like zkpassport-mobile-app's
 * assets/mock-data/passport.ts: the SOD is the app's, and dataGroups come from the SOD's own DG hashes.
 *
 * The older SOD in zkpassport-utils/tests/fixtures signs an all-zero DG2 hash, which the 0.21.0
 * integrity circuit rejects ("Value cannot be the default value when creating a salted value").
 */
export function buildJohn(): PassportViewModel {
  const sod = SOD.fromDER(Binary.fromBase64(johnSODJson.encoded))
  const mrz =
    "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<"
  const dg1 = Binary.fromHex("615B5F1F58").concat(Binary.from(mrz))
  return {
    dateOfIssue: "941112",
    appVersion: "",
    mrz,
    name: "John Smith",
    dateOfBirth: "951112",
    nationality: "ZKR",
    gender: "M",
    passportNumber: "ZP1111111",
    passportExpiry: "350101",
    firstName: "John",
    lastName: "Smith",
    fullName: "John Miller Smith",
    photo: "",
    originalPhoto: "",
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(sod.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, value]: [string, { toNumberArray(): number[] }]) => ({
        groupNumber: Number(key),
        name: "DG" + key,
        hash: value.toNumberArray(),
        value: key === "1" ? dg1.toNumberArray() : [],
      }),
    ),
    dataGroupsHashAlgorithm: sod.encapContentInfo.eContent.hashAlgorithm,
    sod,
  } as PassportViewModel
}
