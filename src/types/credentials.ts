import { Alpha2Code, Alpha3Code } from 'i18n-iso-countries'
import { CountryName } from './countries'

export type NumericalIDCredential = 'age' | 'birthdate' | 'expiry_date'

export type IDCredential =
  | NumericalIDCredential
  | 'nationality'
  | 'firstname'
  | 'lastname'
  | 'fullname'
  | 'document_number'
  | 'document_type'
  | 'issuing_country'
  | 'sex'

export type IDCredentialValue<T extends IDCredential> = T extends 'nationality' | 'issuing_country'
  ? CountryName | Alpha2Code | Alpha3Code
  : T extends 'sex'
  ? 'male' | 'female'
  : T extends 'document_type'
  ? 'passport' | 'id_card' | 'residence_permit' | 'other'
  : T extends NumericalIDCredential
  ? number | Date
  : string

export type IDCredentialConfig = {
  eq?: any
  gte?: number | Date
  gt?: number | Date
  lte?: number | Date
  lt?: number | Date
  range?: [number | Date, number | Date]
  in?: any[]
  out?: any[]
}
