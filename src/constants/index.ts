import { CountryName } from '../types/countries'

/**
 * List of countries that are sanctioned by the US government.
 */
export const SANCTIONED_COUNTRIES: CountryName[] = [
  'North Korea',
  'Iran',
  'Iraq',
  'Libya',
  'Somalia',
  'Sudan',
  'Syrian Arab Republic',
  'Yemen',
]

export const EU_COUNTRIES: CountryName[] = [
  'Austria',
  'Belgium',
  'Bulgaria',
  'Croatia',
  'Cyprus',
  'Czech Republic',
  'Denmark',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'Ireland',
  'Italy',
  'Latvia',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Netherlands',
  'Poland',
  'Portugal',
  'Romania',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
]

const constants = {
  countries: {
    EU: EU_COUNTRIES,
    SANCTIONED: SANCTIONED_COUNTRIES,
  },
}

export default constants
