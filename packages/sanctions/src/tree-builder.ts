/**
 * Sanctions tree module: Poseidon2 leaves for every sanctioned person, in an ordered Merkle tree
 * whose root the Sanctions Registry publishes and the circuit proves non-membership against.
 */
import {
  countryCodeAlpha2ToAlpha3,
  dateToMrz,
  documentNumberAndNationalityLeafPreimage,
  documentNumberToMrz,
  formatMrzName,
  nameAndDobLeafPreimage,
  nameAndYobLeafPreimage,
  nameLeafPreimage,
  poseidon2,
  stringToAsciiStringArray,
} from "@zkpassport/utils"
import { LeafFamilyCounts, SanctionsPerson } from "./types"

/**
 * The tree constructor lives in @zkpassport/utils, next to the packaged sanctions file it feeds,
 * so a client can rebuild a tree from a downloaded file without this package's parser.
 */
export { buildSanctionsTree } from "@zkpassport/utils"

/**
 * All leaves of all four families for a set of persons (unsorted; may overlap across families)
 */
export async function buildSanctionsLeaves(
  persons: SanctionsPerson[],
): Promise<{ leaves: bigint[]; counts: LeafFamilyCounts; mrzCount: number }> {
  const names = nameLeafInputs(persons)
  const documents = documentLeafInputs(persons)
  const name = await hashName(names)
  const nameAndDob = await hashNameAndDob(names)
  const nameAndYob = await hashNameAndYob(names)
  const passportAndCountry = await hashPassportNoAndCountry(documents)
  return {
    leaves: name.concat(nameAndDob, nameAndYob, passportAndCountry),
    counts: {
      name: name.length,
      nameAndDob: nameAndDob.length,
      nameAndYob: nameAndYob.length,
      passportAndCountry: passportAndCountry.length,
    },
    mrzCount: names.length,
  }
}

// ---- internals: MRZ layout, leaf inputs and the four hash families ----

/**
 * One LASTNAME<<FIRSTNAME variant of a sanctioned person with the birth-date fields the three
 * name leaf families need: each MRZ string next to its ASCII bytes
 */
type NameLeafInput = {
  name: string
  nameMRZ: bigint[]
  dob: string | null
  dobMRZ: bigint[] | null
  yob: string | null
  yobMRZ: bigint[] | null
}

/** The document number and nationality of a sanctioned person's passport, as MRZ fields */
type DocumentLeafInput = {
  passportNo: string
  passportNoMRZ: bigint[]
  passportCountry: string
  passportCountryMRZ: bigint[]
}

/**
 * MRZ bytes as Poseidon2 inputs. Uses the same encoder as the verifier side
 * (`getSanctionsHashesFromIdData` in `@zkpassport/utils`), so builder and checker cannot drift.
 */
const asciiBytes = (str: string): bigint[] => stringToAsciiStringArray(str).map(BigInt)

/**
 * Every LASTNAME<<FIRSTNAME combination of a person, as MRZ strings and as byte arrays
 */
function nameCombinationsToMrz(
  firstNames: string[],
  lastNames: string[],
): { nameMRZ: bigint[][]; name: string[] } {
  const names: string[] = []
  const namesMRZ: bigint[][] = []
  for (const first of firstNames) {
    for (const last of lastNames) {
      const mrz = formatMrzName(last, first)
      names.push(mrz)
      namesMRZ.push(asciiBytes(mrz))
    }
  }
  return { nameMRZ: namesMRZ, name: names }
}

/**
 * MRZ date of birth (YYMMDD) and two-digit year of birth from an ISO date at any precision. The
 * date of birth is null when the month or day is unknown; the year is always available.
 */
function processDob(birthDate: string): {
  dob: string | null
  dobMRZ: bigint[] | null
  yob: string
  yobMRZ: bigint[]
} {
  const [year, month, day] = birthDate.split("-")
  const yob = year.slice(-2)
  const yobMRZ = asciiBytes(yob)
  if (month === undefined || day === undefined) return { dob: null, dobMRZ: null, yob, yobMRZ }
  const dob = dateToMrz(birthDate)
  return { dob, dobMRZ: asciiBytes(dob), yob, yobMRZ }
}

function nameLeafInputs(persons: SanctionsPerson[]): NameLeafInput[] {
  const out: NameLeafInput[] = []
  for (const p of persons) {
    const d = p.birthDate ? processDob(p.birthDate) : null
    const { nameMRZ, name } = nameCombinationsToMrz(p.firstNames, p.lastNames)
    for (let i = 0; i < nameMRZ.length; i++) {
      out.push({
        name: name[i],
        nameMRZ: nameMRZ[i],
        dob: d?.dob ?? null,
        dobMRZ: d?.dobMRZ ?? null,
        yob: d?.yob ?? null,
        yobMRZ: d?.yobMRZ ?? null,
      })
    }
  }
  return out
}

/**
 * The passport-side leaf input: the first passport number in the 9-character document number
 * field, and the alpha-3 code of the first nationality, falling back to the first associated
 * country. Null when either is unavailable.
 */
function passportNoAndCountry(p: SanctionsPerson): DocumentLeafInput | null {
  if (p.passports.length === 0 || (p.nationalities.length === 0 && p.countries.length === 0)) {
    return null
  }
  const passportNo = documentNumberToMrz(p.passports[0])
  const alpha2 = p.nationalities.length > 0 ? p.nationalities[0] : p.countries[0]
  const passportCountry = alpha2.length === 2 ? countryCodeAlpha2ToAlpha3(alpha2) : alpha2
  if (!passportCountry) return null
  return {
    passportNo,
    passportNoMRZ: asciiBytes(passportNo),
    passportCountry,
    passportCountryMRZ: asciiBytes(passportCountry),
  }
}

function documentLeafInputs(persons: SanctionsPerson[]): DocumentLeafInput[] {
  const out: DocumentLeafInput[] = []
  for (const p of persons) {
    const m = passportNoAndCountry(p)
    if (m) out.push(m)
  }
  return out
}

async function hashUnique(inputs: bigint[][]): Promise<bigint[]> {
  const seen = new Set<string>()
  const hashes: bigint[] = []
  for (const input of inputs) {
    const key = input.join(",")
    if (seen.has(key)) continue
    seen.add(key)
    hashes.push(await poseidon2(input))
  }
  return hashes
}

// The four leaf layouts come from @zkpassport/utils, where the checker side uses the same
// functions, so the builder and the verifier cannot drift apart.

/** Leaf family 1: Poseidon2(39 name bytes) */
function hashName(inputs: NameLeafInput[]): Promise<bigint[]> {
  return hashUnique(inputs.map((m) => nameLeafPreimage(m.nameMRZ)))
}

/** Leaf family 2: Poseidon2(39 name bytes ‖ 6 DOB bytes) */
function hashNameAndDob(inputs: NameLeafInput[]): Promise<bigint[]> {
  return hashUnique(
    inputs.filter((m) => m.dobMRZ).map((m) => nameAndDobLeafPreimage(m.nameMRZ, m.dobMRZ!)),
  )
}

/** Leaf family 3: Poseidon2(39 name bytes ‖ 2 year-of-birth bytes) */
function hashNameAndYob(inputs: NameLeafInput[]): Promise<bigint[]> {
  return hashUnique(
    inputs.filter((m) => m.yobMRZ).map((m) => nameAndYobLeafPreimage(m.nameMRZ, m.yobMRZ!)),
  )
}

/** Leaf family 4: Poseidon2(9 document number bytes ‖ 3 nationality bytes) */
function hashPassportNoAndCountry(inputs: DocumentLeafInput[]): Promise<bigint[]> {
  return hashUnique(
    inputs.map((p) =>
      documentNumberAndNationalityLeafPreimage(p.passportNoMRZ, p.passportCountryMRZ),
    ),
  )
}
