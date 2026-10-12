import { Binary } from "../binary"
import { SOD } from "../passport/sod"
import type { PassportViewModel } from "../types"
import jackSOD from "./sods/jack-miller-smith-rsa-4096-sha512.json"
import janeSOD from "./sods/jane-miller-smith-rsa-3072-sha384.json"
import johnSOD from "./sods/john-miller-smith-rsa-2048-sha256.json"
import marySOD from "./sods/mary-miller-smith-ecdsa-p256-sha256.json"
import misterSanctionedSOD from "./sods/mister-sanctioned-rsa-2048-sha256.json"
import paulSOD from "./sods/paul-miller-smith-ecdsa-p384-sha384.json"
import stephanieSOD from "./sods/stephanie-miller-smith-ecdsa-p521-sha512.json"

export type MockPassportName =
  "john" | "mary" | "jane" | "jack" | "paul" | "stephanie" | "misterSanctioned"

type Holder = {
  sod: { encoded: string }
  mrz: string
  firstName: string
  lastName: string
  fullName: string
  gender: string
  dateOfBirth: string
  passportNumber: string
  passportExpiry: string
}

// The DG1 template ('61') and its MRZ data object ('5F1F'), each with its length: 91 and 88 bytes
// for a TD3 MRZ. ICAO Doc 9303 Part 10 (8th edition, 2021), section 4.7.1, table 39:
// https://www.icao.int/sites/default/files/publications/DocSeries/9303_p10_cons_en.pdf
const DG1_HEADER = "615B5F1F58"

const HOLDERS: Record<MockPassportName, Holder> = {
  john: {
    sod: johnSOD,
    mrz: "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<",
    firstName: "John",
    lastName: "Smith",
    fullName: "John Miller Smith",
    gender: "M",
    dateOfBirth: "951112",
    passportNumber: "ZP1111111",
    passportExpiry: "350101",
  },
  mary: {
    sod: marySOD,
    mrz: "P<ZKRSMITH<<MARY<MILLER<<<<<<<<<<<<<<<<<<<<<ZP2222222_ZKR750302_F300101_<<<<<<<<<<<<<<<<",
    firstName: "Mary",
    lastName: "Smith",
    fullName: "Mary Miller Smith",
    gender: "F",
    dateOfBirth: "750302",
    passportNumber: "ZP2222222",
    passportExpiry: "300101",
  },
  jane: {
    sod: janeSOD,
    mrz: "P<ZKRSMITH<<JANE<MILLER<<<<<<<<<<<<<<<<<<<<<ZP3333333_ZKR090225_F270101_<<<<<<<<<<<<<<<<",
    firstName: "Jane",
    lastName: "Smith",
    fullName: "Jane Miller Smith",
    gender: "F",
    dateOfBirth: "090225",
    passportNumber: "ZP3333333",
    passportExpiry: "270101",
  },
  jack: {
    sod: jackSOD,
    mrz: "P<ZKRSMITH<<JACK<MILLER<<<<<<<<<<<<<<<<<<<<<ZP4444444_ZKR020414_M280101_<<<<<<<<<<<<<<<<",
    firstName: "Jack",
    lastName: "Smith",
    fullName: "Jack Miller Smith",
    gender: "M",
    dateOfBirth: "020414",
    passportNumber: "ZP4444444",
    passportExpiry: "280101",
  },
  paul: {
    sod: paulSOD,
    mrz: "P<ZKRSMITH<<PAUL<MILLER<<<<<<<<<<<<<<<<<<<<<ZP6666666_ZKR500717_M310101_<<<<<<<<<<<<<<<<",
    firstName: "Paul",
    lastName: "Smith",
    fullName: "Paul Miller Smith",
    gender: "M",
    dateOfBirth: "500717",
    passportNumber: "ZP6666666",
    passportExpiry: "310101",
  },
  stephanie: {
    sod: stephanieSOD,
    mrz: "P<ZKRSMITH<<STEPHANIE<MILLER<<<<<<<<<<<<<<<<ZP5555555_ZKR150503_F290101_<<<<<<<<<<<<<<<<",
    firstName: "Stephanie",
    lastName: "Smith",
    fullName: "Stephanie Miller Smith",
    gender: "F",
    dateOfBirth: "150503",
    passportNumber: "ZP5555555",
    passportExpiry: "290101",
  },
  misterSanctioned: {
    sod: misterSanctionedSOD,
    mrz: "P<ZKRSANCTIONED<<MISTER<<<<<<<<<<<<<<<<<<<<<ZP7777777_ZKR750101_M300201_<<<<<<<<<<<<<<<<",
    firstName: "Mister",
    lastName: "Sanctioned",
    fullName: "Mister Sanctioned",
    gender: "M",
    dateOfBirth: "750101",
    passportNumber: "ZP7777777",
    passportExpiry: "300201",
  },
}

/**
 * Build the mock passports of the Zero Knowledge Republic (ZKR), keyed by name. Their DSCs chain to
 * the ZKR CSCAs, which only the testnet certificate registry holds. They come without photos.
 */
export function getMockPassports(): Record<MockPassportName, PassportViewModel> {
  const entries = Object.entries(HOLDERS).map(([name, holder]) => [name, buildPassport(holder)])
  return Object.fromEntries(entries)
}

function buildPassport(holder: Holder): PassportViewModel {
  const sod = SOD.fromDER(Binary.fromBase64(holder.sod.encoded))
  const dg1 = Binary.fromHex(DG1_HEADER).concat(Binary.from(holder.mrz))

  return {
    appVersion: "",
    mrz: holder.mrz,
    name: `${holder.firstName} ${holder.lastName}`,
    fullName: holder.fullName,
    firstName: holder.firstName,
    lastName: holder.lastName,
    dateOfBirth: holder.dateOfBirth,
    nationality: "ZKR",
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
