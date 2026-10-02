/**
 * Sanctions tree module: Poseidon2 leaves for every sanctioned person, the ordered Merkle tree
 * over them whose root the Sanctions Registry publishes and the circuit proves non-membership
 * against, and the packaged sanctions file that records the tree for publication.
 *
 * Reading a packaged sanctions file back (its type, the shape check and the root recomputation)
 * lives in @zkpassport/utils, so a client can verify a downloaded file without this package.
 */
import {
  buildSanctionsTree,
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
  nodeToHex,
  poseidon2,
  stringToAsciiStringArray,
  type AsyncOrderedMT,
  type PackagedSanctionsFileV1,
  type SanctionsSource,
} from "@zkpassport/utils"
import { LeafFamilyCounts, SanctionsPerson } from "./types"

/**
 * Input for {@link createPackagedSanctionsFile}.
 */
export type CreatePackagedSanctionsFileInput = {
  /** Unix seconds at which the package is built; also published with the root */
  timestamp: number
  /** Environment label, e.g. "test"; omit for production */
  environment?: string
  /** The root this one supersedes, if any */
  previous_root?: string
  /** Leaf hashes from all sources and all leaf families, in any order, duplicates allowed */
  leaves: bigint[]
  /** Depth of the sanctions tree; the Sanctions Registry records it as its tree height */
  tree_depth: number
  /** One record per upstream snapshot the leaves were derived from */
  sources: SanctionsSource[]
  /** Version of @zkpassport/sanctions, which parsed the snapshots and hashed the leaves */
  sanctions_version: string
  /** Version of @zkpassport/utils, which provides poseidon2 and AsyncOrderedMT */
  utils_version: string
  /** Licence attribution of the upstream data, e.g. OpenSanctions' CC BY-NC 4.0 notice */
  attribution: string
}

/**
 * Build the sanctions tree from the leaves and assemble a {@link PackagedSanctionsFileV1} around
 * its root. The tree is returned as well, so a publisher can serialise it without building it
 * twice.
 */
export async function createPackagedSanctionsFile(
  input: CreatePackagedSanctionsFileInput,
): Promise<{ file: PackagedSanctionsFileV1; tree: AsyncOrderedMT }> {
  if (input.leaves.length === 0) {
    throw new Error("A packaged sanctions file needs at least one leaf")
  }
  const tree = await buildSanctionsTree(input.leaves, input.tree_depth)

  const file: PackagedSanctionsFileV1 = {
    version: 1,
    timestamp: input.timestamp,
    ...(input.environment !== undefined && { environment: input.environment }),
    root: nodeToHex(tree.root),
    ...(input.previous_root !== undefined && {
      previous_root: nodeToHex(BigInt(input.previous_root)),
    }),
    leaves: tree.leaves.map(nodeToHex),
    sources: [...input.sources].sort((a, b) => a.dataset.localeCompare(b.dataset)),
    builder: {
      sanctions_version: input.sanctions_version,
      utils_version: input.utils_version,
      tree_depth: input.tree_depth,
    },
    attribution: input.attribution,
  }
  return { file, tree }
}

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
 * field, followed by the 3-letter code of the first nationality that has one, falling back to the
 * associated countries in order. Null when the person has no passport number or no country value
 * resolves.
 */
function passportNoAndCountry(p: SanctionsPerson): string | null {
  if (p.passports.length === 0) return null
  const passportCountry = [...p.nationalities, ...p.countries].map(mrzCountryCode).find(Boolean)
  if (!passportCountry) return null
  return documentNumberToMrz(p.passports[0]) + passportCountry
}

/**
 * A source country value as the 3-letter code the MRZ nationality field holds: an ISO alpha-2 code
 * through the ISO table, a 3-letter value as given (ICAO issues codes ISO does not have, such as
 * GBD or RKS). Anything else resolves to nothing; OpenSanctions also emits the four-letter ISO
 * 3166-3 codes of former states, such as SUHH for the Soviet Union, which no passport carries.
 */
function mrzCountryCode(value: string): string | undefined {
  if (value.length === 2) return countryCodeAlpha2ToAlpha3(value)
  return value.length === 3 ? value : undefined
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
