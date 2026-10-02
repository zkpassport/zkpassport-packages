/**
 * Preimages of the four leaf families of the sanctions tree.
 *
 * Inputs are the ASCII codes of TD3 MRZ fields, as hex strings or bigints.
 * The output keeps the input's representation for `poseidon2`.
 */

import {
  MRZ_COUNTRY_CODE_LENGTH,
  MRZ_DATE_LENGTH,
  MRZ_DOCUMENT_NUMBER_LENGTH,
  MRZ_NAME_LENGTH,
} from "@/passport/mrz"

/** `YY`: the year of birth is the first two bytes of the MRZ date of birth */
export const SANCTIONS_YOB_LENGTH = 2

function expectLength<T>(field: string, bytes: T[], length: number): T[] {
  if (bytes.length !== length) {
    throw new Error(`Sanctions leaf: ${field} must be ${length} bytes, got ${bytes.length}`)
  }
  return bytes
}

/** Family 1: the 39 name bytes */
export function nameLeafPreimage<T>(name: T[]): T[] {
  return [...expectLength("name", name, MRZ_NAME_LENGTH)]
}

/** Family 2: name ‖ date of birth (`YYMMDD`) */
export function nameAndDobLeafPreimage<T>(name: T[], dob: T[]): T[] {
  return [
    ...expectLength("name", name, MRZ_NAME_LENGTH),
    ...expectLength("date of birth", dob, MRZ_DATE_LENGTH),
  ]
}

/** Family 3: name ‖ year of birth (`YY`, the first two bytes of the MRZ date of birth) */
export function nameAndYobLeafPreimage<T>(name: T[], yob: T[]): T[] {
  return [
    ...expectLength("name", name, MRZ_NAME_LENGTH),
    ...expectLength("year of birth", yob, SANCTIONS_YOB_LENGTH),
  ]
}

/** Family 4: document number ‖ nationality */
export function documentNumberAndNationalityLeafPreimage<T>(
  documentNumber: T[],
  nationality: T[],
): T[] {
  return [
    ...expectLength("document number", documentNumber, MRZ_DOCUMENT_NUMBER_LENGTH),
    ...expectLength("nationality", nationality, MRZ_COUNTRY_CODE_LENGTH),
  ]
}
