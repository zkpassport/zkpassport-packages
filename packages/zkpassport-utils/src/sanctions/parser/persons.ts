/**
 * From FollowTheMoney Person entities to MRZ-ready person records.
 */
import { prop } from "./ftm"
import { isMrzName, transliterate } from "./transliteration"
import { DroppedName, FtmEntity, SanctionsPerson, SanctionsStatus } from "../types"

export type ExtractPersonsResult = {
  persons: SanctionsPerson[]
  /** Name variants that could not be represented in the MRZ alphabet */
  dropped: DroppedName[]
  /**
   * Ids of Person entities that have names but none representable in the MRZ alphabet, so they
   * enter the tree with no leaves at all. Publishers should treat a non-empty list as an error:
   * it means a script needs a transliteration (see README, "Scripts and transliteration policy").
   */
  uncovered: string[]
}

/** FTM date: YYYY, YYYY-MM or YYYY-MM-DD, optionally followed by a time component */
const FTM_DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T.*)?$/

/**
 * Normalise an FTM date to its calendar part at the source's precision. Returns null for values
 * that are not FTM dates.
 */
export function normalizeBirthDate(value: string | undefined): string | null {
  if (!value) return null
  const m = value.trim().match(FTM_DATE)
  if (!m) return null
  const [, y, mo, d] = m
  return d ? `${y}-${mo}-${d}` : mo ? `${y}-${mo}` : y
}

/**
 * Every full-name variant of an entity: the `name` values, then each combination of firstName,
 * middleName, secondName and lastName joined by spaces, in source order, without duplicates.
 * Matches how OpenSanctions composes names from parts.
 */
export function nameVariants(entity: FtmEntity): string[] {
  const names = [...prop(entity, "name")]
  const first = prop(entity, "firstName")
  const middle = prop(entity, "middleName")
  const second = prop(entity, "secondName")
  const last = prop(entity, "lastName")
  if (first.length || second.length || last.length) {
    for (const f of first.length ? first : [""]) {
      for (const m of middle.length ? middle : [""]) {
        for (const s of second.length ? second : [""]) {
          for (const l of last.length ? last : [""]) {
            const full = [f, m, s, l].filter(Boolean).join(" ")
            if (full && !names.includes(full)) names.push(full)
          }
        }
      }
    }
  }
  return names
}

/**
 * Transliterate each value; keep the ones that land in the MRZ alphabet (deduplicated, sorted),
 * report the rest.
 */
function toMrzNames(
  id: string,
  values: string[],
  dropped: DroppedName[],
): { kept: string[]; keptInOrder: string[] } {
  const seen = new Set<string>()
  const keptInOrder: string[] = []
  for (const value of values) {
    const t = transliterate(value)
    if (!isMrzName(t)) {
      dropped.push({ id, name: value, transliterated: t })
      continue
    }
    if (seen.has(t)) continue
    seen.add(t)
    keptInOrder.push(t)
  }
  return { kept: [...keptInOrder].sort(), keptInOrder }
}

const TOPIC_STATUS: Array<[string, SanctionsStatus]> = [
  ["sanction", "sanctioned"],
  ["debarment", "debarred"],
  ["wanted", "wanted"],
  ["crime", "crime-related"],
  ["pep", "pep"],
  ["poi", "person-of-interest"],
]

export function statusOf(entity: FtmEntity): SanctionsStatus[] {
  const topics = prop(entity, "topics")
  const status: SanctionsStatus[] = []
  for (const [topic, s] of TOPIC_STATUS) if (topics.includes(topic)) status.push(s)
  const datasets = (entity.datasets ?? []).map((d) => d.toLowerCase())
  if (datasets.some((d) => d.includes("interpol")) && !status.includes("wanted")) {
    status.push("interpol-notice")
  }
  if (datasets.some((d) => d.includes("pep")) && !status.includes("pep")) status.push("pep")
  if (datasets.some((d) => d.includes("disqualified"))) status.push("disqualified")
  return status
}

/**
 * Country codes associated with a person: `country` and `nationality`, plus 2-3 letter codes
 * given as `birthPlace` or as the last comma-separated part of an `address`. Upper-cased,
 * deduplicated and sorted so that the first entry is stable across runs.
 */
export function countriesOf(entity: FtmEntity): string[] {
  const codes = new Set<string>()
  for (const c of prop(entity, "country")) codes.add(c.toUpperCase())
  for (const c of prop(entity, "nationality")) codes.add(c.toUpperCase())
  for (const place of prop(entity, "birthPlace")) {
    if (/^[A-Za-z]{2,3}$/.test(place)) codes.add(place.toUpperCase())
  }
  for (const address of prop(entity, "address")) {
    const last = address.split(",").pop()?.trim() ?? ""
    if (/^[A-Za-z]{2,3}$/.test(last)) codes.add(last.toUpperCase())
  }
  return [...codes].sort()
}

/**
 * Extract the MRZ-ready person records of one FTM entity. Non-Person schemas yield nothing.
 * One record is emitted per representable full-name variant; a variant whose transliteration
 * leaves characters outside the MRZ alphabet is reported in `dropped` instead of emitted.
 */
export function extractPersons(entity: FtmEntity): ExtractPersonsResult {
  const dropped: DroppedName[] = []
  if (entity.schema !== "Person") return { persons: [], dropped, uncovered: [] }

  const variants = nameVariants(entity)
  const { keptInOrder: names } = toMrzNames(entity.id, variants, dropped)
  if (names.length === 0) {
    return { persons: [], dropped, uncovered: variants.length ? [entity.id] : [] }
  }

  const firstNames = toMrzNames(entity.id, prop(entity, "firstName"), dropped).kept
  const middleNames = toMrzNames(entity.id, prop(entity, "middleName"), dropped).kept
  const secondNames = toMrzNames(entity.id, prop(entity, "secondName"), dropped).kept
  const lastNames = toMrzNames(entity.id, prop(entity, "lastName"), dropped).kept

  const aliasValues = [...prop(entity, "alias"), ...prop(entity, "weakAlias")]
  const aliases = [...new Set(aliasValues.filter((a) => !variants.includes(a)))].sort()

  const shared = {
    id: entity.id,
    firstNames,
    middleNames,
    secondNames,
    lastNames,
    aliases,
    birthDate: normalizeBirthDate(prop(entity, "birthDate")[0]),
    passports: prop(entity, "passportNumber"),
    nationalities: prop(entity, "nationality").map((c) => c.toUpperCase()),
    countries: countriesOf(entity),
    status: statusOf(entity),
    datasets: entity.datasets ?? [],
  }
  return { persons: names.map((name) => ({ ...shared, name })), dropped, uncovered: [] }
}

/**
 * Extract the person records of a whole dataset
 */
export function extractAllPersons(entities: FtmEntity[]): ExtractPersonsResult {
  const persons: SanctionsPerson[] = []
  const dropped: DroppedName[] = []
  const uncovered: string[] = []
  for (const entity of entities) {
    const r = extractPersons(entity)
    persons.push(...r.persons)
    dropped.push(...r.dropped)
    uncovered.push(...r.uncovered)
  }
  return { persons, dropped, uncovered }
}
