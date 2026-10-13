import { Binary } from "@zkpassport/utils"

export type MockPassportName =
  | "john"
  | "mary"
  | "jane"
  | "jack"
  | "paul"
  | "stephanie"
  | "misterSanctioned"
  | "peter"
  | "lucie"
  | "mark"

export type Holder = {
  mrz: string
  firstName: string
  lastName: string
  fullName: string
  gender: string
  nationality: string
  dateOfBirth: string
  passportNumber: string
  passportExpiry: string
}

// The DG1 template ('61') and its MRZ data object ('5F1F'), each with its length: 91 and 88 bytes
// for a TD3 MRZ. ICAO Doc 9303 Part 10 (8th edition, 2021), section 4.7.1, table 39:
// https://www.icao.int/sites/default/files/publications/DocSeries/9303_p10_cons_en.pdf
const DG1_HEADER = "615B5F1F58"

/** The holders of the mock passports, all issued by the Zero Knowledge Republic (ZKR) */
export const HOLDERS: Record<MockPassportName, Holder> = {
  john: {
    mrz: "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<",
    firstName: "John",
    lastName: "Smith",
    fullName: "John Miller Smith",
    gender: "M",
    nationality: "ZKR",
    dateOfBirth: "951112",
    passportNumber: "ZP1111111",
    passportExpiry: "350101",
  },
  mary: {
    mrz: "P<ZKRSMITH<<MARY<MILLER<<<<<<<<<<<<<<<<<<<<<ZP2222222_ZKR750302_F300101_<<<<<<<<<<<<<<<<",
    firstName: "Mary",
    lastName: "Smith",
    fullName: "Mary Miller Smith",
    gender: "F",
    nationality: "ZKR",
    dateOfBirth: "750302",
    passportNumber: "ZP2222222",
    passportExpiry: "300101",
  },
  jane: {
    mrz: "P<ZKRSMITH<<JANE<MILLER<<<<<<<<<<<<<<<<<<<<<ZP3333333_ZKR090225_F270101_<<<<<<<<<<<<<<<<",
    firstName: "Jane",
    lastName: "Smith",
    fullName: "Jane Miller Smith",
    gender: "F",
    nationality: "ZKR",
    dateOfBirth: "090225",
    passportNumber: "ZP3333333",
    passportExpiry: "270101",
  },
  jack: {
    mrz: "P<ZKRSMITH<<JACK<MILLER<<<<<<<<<<<<<<<<<<<<<ZP4444444_ZKR020414_M280101_<<<<<<<<<<<<<<<<",
    firstName: "Jack",
    lastName: "Smith",
    fullName: "Jack Miller Smith",
    gender: "M",
    nationality: "ZKR",
    dateOfBirth: "020414",
    passportNumber: "ZP4444444",
    passportExpiry: "280101",
  },
  paul: {
    mrz: "P<ZKRSMITH<<PAUL<MILLER<<<<<<<<<<<<<<<<<<<<<ZP6666666_ZKR500717_M310101_<<<<<<<<<<<<<<<<",
    firstName: "Paul",
    lastName: "Smith",
    fullName: "Paul Miller Smith",
    gender: "M",
    nationality: "ZKR",
    dateOfBirth: "500717",
    passportNumber: "ZP6666666",
    passportExpiry: "310101",
  },
  stephanie: {
    mrz: "P<ZKRSMITH<<STEPHANIE<MILLER<<<<<<<<<<<<<<<<ZP5555555_ZKR150503_F290101_<<<<<<<<<<<<<<<<",
    firstName: "Stephanie",
    lastName: "Smith",
    fullName: "Stephanie Miller Smith",
    gender: "F",
    nationality: "ZKR",
    dateOfBirth: "150503",
    passportNumber: "ZP5555555",
    passportExpiry: "290101",
  },
  misterSanctioned: {
    mrz: "P<ZKRSANCTIONED<<MISTER<<<<<<<<<<<<<<<<<<<<<ZP7777777_ZKR750101_M300201_<<<<<<<<<<<<<<<<",
    firstName: "Mister",
    lastName: "Sanctioned",
    fullName: "Mister Sanctioned",
    gender: "M",
    nationality: "ZKR",
    dateOfBirth: "750101",
    passportNumber: "ZP7777777",
    passportExpiry: "300201",
  },
  // Expired on 2024-01-01, so the disclosure circuits reject it
  peter: {
    mrz: "P<ZKRSMITH<<PETER<MILLER<<<<<<<<<<<<<<<<<<<<ZP8888888_ZKR880726_M240101_<<<<<<<<<<<<<<<<",
    firstName: "Peter",
    lastName: "Smith",
    fullName: "Peter Miller Smith",
    gender: "M",
    nationality: "ZKR",
    dateOfBirth: "880726",
    passportNumber: "ZP8888888",
    passportExpiry: "240101",
  },
  lucie: {
    mrz: "P<ZKRSMITH<<LUCIE<MILLER<<<<<<<<<<<<<<<<<<<<ZP9999999_FRA930418_F330101_<<<<<<<<<<<<<<<<",
    firstName: "Lucie",
    lastName: "Smith",
    fullName: "Lucie Miller Smith",
    gender: "F",
    nationality: "FRA",
    dateOfBirth: "930418",
    passportNumber: "ZP9999999",
    passportExpiry: "330101",
  },
  mark: {
    mrz: "P<ZKRSMITH<<MARK<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1010101_ZKR850920_M340101_<<<<<<<<<<<<<<<<",
    firstName: "Mark",
    lastName: "Smith",
    fullName: "Mark Miller Smith",
    gender: "M",
    nationality: "ZKR",
    dateOfBirth: "850920",
    passportNumber: "ZP1010101",
    passportExpiry: "340101",
  },
}

/** A holder's DG1: the MRZ in its DG1 template */
export function getDG1(holder: Holder): Binary {
  return Binary.fromHex(DG1_HEADER).concat(Binary.from(holder.mrz))
}
