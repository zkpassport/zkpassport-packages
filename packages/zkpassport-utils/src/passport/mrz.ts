/**
 * TD3 MRZ field writers (ICAO Doc 9303 Part 4), the inverse of the range getters in getters.ts:
 * they lay identity attributes out the way the machine readable zone of a passport prints them.
 */

export const MRZ_FILLER = "<"
/** Name field, positions 6-44 of line 1 */
export const MRZ_NAME_LENGTH = 39
/** Document number field */
export const MRZ_DOCUMENT_NUMBER_LENGTH = 9
/** Dates are `YYMMDD` */
export const MRZ_DATE_LENGTH = 6
/** Nationality and issuing state are alpha-3 codes */
export const MRZ_COUNTRY_CODE_LENGTH = 3

/**
 * Within a name identifier, spaces and hyphens become single fillers (Part 4 §4.2.2.2); periods
 * are omitted. Upper-cased.
 */
export function namePartToMrz(part: string): string {
  return part.replace(/\./g, "").replace(/[- ]/g, MRZ_FILLER).toUpperCase()
}

/**
 * The name field for a primary (family) and secondary (given) identifier: `PRIMARY<<SECONDARY`,
 * filler-padded to 39 characters or truncated there.
 */
export function formatMrzName(primary: string, secondary: string): string {
  const joined = `${namePartToMrz(primary)}${MRZ_FILLER}${MRZ_FILLER}${namePartToMrz(secondary)}`
  return joined.length > MRZ_NAME_LENGTH
    ? joined.slice(0, MRZ_NAME_LENGTH)
    : joined.padEnd(MRZ_NAME_LENGTH, MRZ_FILLER)
}

/**
 * The nationality or issuing state field for an ISO alpha-3 code. Germany is the one state whose
 * documents do not carry its alpha-3 code: ICAO Doc 9303 Part 3 lets it print the historic `D`,
 * filler-padded to the 3-character field, and `normalizeCountryCode` in country.ts reads that
 * back as `DEU`.
 */
export function countryCodeToMrz(alpha3: string): string {
  return alpha3 === "DEU" ? "D".padEnd(MRZ_COUNTRY_CODE_LENGTH, MRZ_FILLER) : alpha3
}

/** `YYMMDD` from an ISO `YYYY-MM-DD` date */
export function dateToMrz(isoDate: string): string {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(isoDate)
  if (!m) throw new Error(`Expected an ISO YYYY-MM-DD date, got "${isoDate}"`)
  return m[1].slice(-2) + m[2].padStart(2, "0") + m[3].padStart(2, "0")
}

/**
 * The 9-character document number field, filler-padded. A longer number overflows into the
 * optional data field and only its first 9 characters appear here (Part 4 §4.2.2.2 note j).
 */
export function documentNumberToMrz(documentNumber: string): string {
  return documentNumber
    .slice(0, MRZ_DOCUMENT_NUMBER_LENGTH)
    .padEnd(MRZ_DOCUMENT_NUMBER_LENGTH, MRZ_FILLER)
}
