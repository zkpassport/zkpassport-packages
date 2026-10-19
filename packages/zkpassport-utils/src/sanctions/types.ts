/**
 * One entity from an OpenSanctions FollowTheMoney export (`entities.ftm.json`). Every property is
 * multi-valued and every value is a string. See https://followthemoney.tech/explorer/schemata/Person/
 */
export type FtmEntity = {
  id: string
  schema: string
  properties: Record<string, string[] | undefined>
  datasets?: string[]
  referents?: string[]
  caption?: string
  first_seen?: string
  last_seen?: string
  last_change?: string
}

/**
 * Controlled status tags derived from the entity's `topics` and datasets
 */
export type SanctionsStatus =
  | "sanctioned"
  | "debarred"
  | "wanted"
  | "crime-related"
  | "pep"
  | "person-of-interest"
  | "interpol-notice"
  | "disqualified"

/**
 * A sanctioned person as one MRZ-ready name variant plus the identity attributes the tree hashes.
 * One FTM Person entity yields one record per name variant; the records share id, dates,
 * passports and countries.
 *
 * All strings that feed leaves (`name`, `firstNames`, `lastNames`) are already in the MRZ
 * alphabet (A-Z, space, hyphen) after ICAO 9303 transliteration.
 */
export type SanctionsPerson = {
  /** OpenSanctions entity id */
  id: string
  /** This variant's full name, transliterated and upper-cased */
  name: string
  /** Given-name parts, each transliterated and upper-cased */
  firstNames: string[]
  middleNames: string[]
  /** Deprecated FTM field, kept because some sources still populate it */
  secondNames: string[]
  /** Family-name parts, each transliterated and upper-cased */
  lastNames: string[]
  /** `alias` and `weakAlias` values not already among the names; informational, not hashed */
  aliases: string[]
  /** ISO 8601 date at the source's precision: YYYY, YYYY-MM or YYYY-MM-DD; null if unknown */
  birthDate: string | null
  /** Passport numbers as listed by the source */
  passports: string[]
  /** ISO 3166-1 alpha-2 codes from `nationality`, upper-cased, source order */
  nationalities: string[]
  /** Sorted union of country codes associated with the person (see extractPersons) */
  countries: string[]
  status: SanctionsStatus[]
  datasets: string[]
}

/**
 * A name variant that could not be brought into the MRZ alphabet and was therefore not emitted
 */
export type DroppedName = {
  id: string
  /** The original value */
  name: string
  /** What transliteration produced; contains characters outside A-Z, space and hyphen */
  transliterated: string
}

/** How many leaves each family contributed to a tree */
export type LeafFamilyCounts = {
  name: number
  nameAndDob: number
  nameAndYob: number
  passportAndCountry: number
}
