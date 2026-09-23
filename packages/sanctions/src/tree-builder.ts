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
  MRZ_DOCUMENT_NUMBER_LENGTH,
  MRZ_NAME_LENGTH,
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
 * All leaves of all four families for a set of persons, deduplicated within each family (a leaf
 * may still occur in more than one family). `mrzCount` is the number of given-name × family-name
 * combinations the persons produced before deduplication.
 *
 * The persons are first reduced to the distinct MRZ field values of each family, as strings, and
 * only those are encoded and hashed: a sanctions list expands to millions of name combinations of
 * which a few percent are distinct, so materialising the byte array of every combination costs
 * tens of gigabytes.
 */
export async function buildSanctionsLeaves(
  persons: SanctionsPerson[],
): Promise<{ leaves: bigint[]; counts: LeafFamilyCounts; mrzCount: number }> {
  const fields = collectLeafFields(persons)
  const name = await hashAll(fields.name, (f) => nameLeafPreimage(asciiBytes(f)))
  const nameAndDob = await hashAll(fields.nameAndDob, (f) =>
    nameAndDobLeafPreimage(
      asciiBytes(f.slice(0, MRZ_NAME_LENGTH)),
      asciiBytes(f.slice(MRZ_NAME_LENGTH)),
    ),
  )
  const nameAndYob = await hashAll(fields.nameAndYob, (f) =>
    nameAndYobLeafPreimage(
      asciiBytes(f.slice(0, MRZ_NAME_LENGTH)),
      asciiBytes(f.slice(MRZ_NAME_LENGTH)),
    ),
  )
  const passportAndCountry = await hashAll(fields.passportAndCountry, (f) =>
    documentNumberAndNationalityLeafPreimage(
      asciiBytes(f.slice(0, MRZ_DOCUMENT_NUMBER_LENGTH)),
      asciiBytes(f.slice(MRZ_DOCUMENT_NUMBER_LENGTH)),
    ),
  )
  return {
    leaves: name.concat(nameAndDob, nameAndYob, passportAndCountry),
    counts: {
      name: name.length,
      nameAndDob: nameAndDob.length,
      nameAndYob: nameAndYob.length,
      passportAndCountry: passportAndCountry.length,
    },
    mrzCount: fields.combinations,
  }
}

// ---- internals: MRZ fields per leaf family, then their hashes ----

/**
 * The distinct MRZ field values of each leaf family, each value being the family's fixed-width
 * fields concatenated in leaf order
 */
type LeafFields = {
  /** Family 1: the 39-character `PRIMARY<<SECONDARY` name field */
  name: Set<string>
  /** Family 2: name field ‖ `YYMMDD` date of birth */
  nameAndDob: Set<string>
  /** Family 3: name field ‖ `YY` year of birth */
  nameAndYob: Set<string>
  /** Family 4: 9-character document number field ‖ alpha-3 nationality */
  passportAndCountry: Set<string>
  /** Given-name × family-name combinations seen, before deduplication */
  combinations: number
}

function collectLeafFields(persons: SanctionsPerson[]): LeafFields {
  const fields: LeafFields = {
    name: new Set(),
    nameAndDob: new Set(),
    nameAndYob: new Set(),
    passportAndCountry: new Set(),
    combinations: 0,
  }
  for (const p of persons) {
    const birth = p.birthDate ? birthFields(p.birthDate) : null
    for (const first of p.firstNames) {
      for (const last of p.lastNames) {
        const name = formatMrzName(last, first)
        fields.combinations += 1
        fields.name.add(name)
        if (birth?.dob) fields.nameAndDob.add(name + birth.dob)
        if (birth) fields.nameAndYob.add(name + birth.yob)
      }
    }

    const document = passportNoAndCountry(p)
    if (document) fields.passportAndCountry.add(document)
  }
  return fields
}

/**
 * MRZ date of birth (`YYMMDD`) and two-digit year of birth from an ISO date at any precision. The
 * date of birth is null when the month or day is unknown; the year is always available.
 */
function birthFields(birthDate: string): { dob: string | null; yob: string } {
  const [year, month, day] = birthDate.split("-")
  const dob = month !== undefined && day !== undefined ? dateToMrz(birthDate) : null
  return { dob, yob: year.slice(-2) }
}

/**
 * The document leaf's fields: the first passport number in the 9-character document number
 * field, followed by the alpha-3 code of the first nationality, falling back to the first
 * associated country. Null when either is unavailable.
 */
function passportNoAndCountry(p: SanctionsPerson): string | null {
  if (p.passports.length === 0 || (p.nationalities.length === 0 && p.countries.length === 0)) {
    return null
  }
  const alpha2 = p.nationalities.length > 0 ? p.nationalities[0] : p.countries[0]
  const passportCountry = alpha2.length === 2 ? countryCodeAlpha2ToAlpha3(alpha2) : alpha2
  if (!passportCountry) return null
  return documentNumberToMrz(p.passports[0]) + passportCountry
}

/**
 * MRZ bytes as Poseidon2 inputs. Uses the same encoder as the verifier side
 * (`getSanctionsHashesFromIdData` in `@zkpassport/utils`), so builder and checker cannot drift.
 */
const asciiBytes = (str: string): bigint[] => stringToAsciiStringArray(str).map(BigInt)

/**
 * Poseidon2 of every field value, laid out by one of the leaf preimage functions of
 * `@zkpassport/utils`, which the verifier uses too, so builder and verifier cannot drift apart.
 */
async function hashAll(
  fields: Set<string>,
  preimage: (field: string) => bigint[],
): Promise<bigint[]> {
  const hashes: bigint[] = []
  for (const field of fields) hashes.push(await poseidon2(preimage(field)))
  return hashes
}
