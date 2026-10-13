import { Binary, SOD, type PassportViewModel } from "@zkpassport/utils"
import { getDG1, HOLDERS, type Holder, type MockPassportName } from "./holders"
import jackSOD from "./sods/jack-miller-smith-rsa-4096-sha512.json"
import janeSOD from "./sods/jane-miller-smith-rsa-3072-sha384.json"
import johnSOD from "./sods/john-miller-smith-rsa-2048-sha256.json"
import lucieSOD from "./sods/lucie-miller-smith-rsa-2048-sha256.json"
import markSOD from "./sods/mark-miller-smith-rsa-4096-pss-sha512.json"
import marySOD from "./sods/mary-miller-smith-ecdsa-p256-sha256.json"
import misterSanctionedSOD from "./sods/mister-sanctioned-rsa-2048-sha256.json"
import paulSOD from "./sods/paul-miller-smith-ecdsa-p384-sha384.json"
import peterSOD from "./sods/peter-miller-smith-rsa-2048-sha256.json"
import stephanieSOD from "./sods/stephanie-miller-smith-ecdsa-p521-sha512.json"

export type { MockPassportName } from "./holders"

const SODS: Record<MockPassportName, { encoded: string }> = {
  john: johnSOD,
  mary: marySOD,
  jane: janeSOD,
  jack: jackSOD,
  paul: paulSOD,
  stephanie: stephanieSOD,
  misterSanctioned: misterSanctionedSOD,
  peter: peterSOD,
  lucie: lucieSOD,
  mark: markSOD,
}

/**
 * Build the mock passports of the Zero Knowledge Republic (ZKR), keyed by name. Their DSCs chain to
 * the ZKR CSCAs, which only the testnet certificate registry holds. They come without photos.
 */
export function getMockPassports(): Record<MockPassportName, PassportViewModel> {
  const entries = Object.entries(HOLDERS).map(([name, holder]) => [
    name,
    buildPassport(holder, SODS[name as MockPassportName]),
  ])
  return Object.fromEntries(entries)
}

function buildPassport(holder: Holder, encodedSod: { encoded: string }): PassportViewModel {
  const sod = SOD.fromDER(Binary.fromBase64(encodedSod.encoded))
  const dg1 = getDG1(holder)

  return {
    appVersion: "",
    mrz: holder.mrz,
    name: `${holder.firstName} ${holder.lastName}`,
    fullName: holder.fullName,
    firstName: holder.firstName,
    lastName: holder.lastName,
    dateOfBirth: holder.dateOfBirth,
    nationality: holder.nationality,
    gender: holder.gender,
    passportNumber: holder.passportNumber,
    dateOfIssue: "",
    passportExpiry: holder.passportExpiry,
    photo: "",
    originalPhoto: "",
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    // Hashes come from the SOD; only DG1 is filled in
    dataGroups: Object.entries(sod.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, hash]) => ({
        groupNumber: Number(key),
        name: `DG${key}`,
        hash: hash.toNumberArray(),
        value: key === "1" ? dg1.toNumberArray() : [],
      }),
    ),
    dataGroupsHashAlgorithm: sod.encapContentInfo.eContent.hashAlgorithm,
    sod,
  }
}
