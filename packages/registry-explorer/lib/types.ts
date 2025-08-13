import { PackagedCertificate } from "@zkpassport/utils"
export interface CertificateFilterState {
  searchTerm: string
  selectedCountry: string
  selectedHashAlgorithm: string
  selectedSignatureType: string
  selectedRSAType: string
  selectedCurve: string
}

export interface CountryData {
  [countryCode: string]: {
    support: "full" | "partial" | "none"
    dateRange?: {
      from: string
      to: string
    }
    hasExtendedCoverage?: boolean
    certificateCount?: number
    privateKeyUsagePeriodCoverage?: {
      percentage: number
      coveredDays: number
      totalDaysInPeriod: number
      hasGaps: boolean
      hasPrivateKeyData: boolean
      certificatesWithoutPeriods: number
    }
    hasRecentUpdate?: boolean
  }
}

export interface WorldMapProps {
  data?: CountryData
  certificatesByCountry?: Record<string, PackagedCertificate[]>
  recentlyUpdatedCountries?: Set<string>
  onCountryClick?: (countryCode: string, countryName: string) => void
  registryUpdateDate?: string
  onCountrySearch?: (countryCode: string) => void
  resetMapView?: boolean
}

export interface GeographyProperties {
  ISO_A3?: string
  NAME?: string
  name?: string
  [key: string]: unknown
}

export interface GeographyObject {
  rsmKey: string
  properties: GeographyProperties
  id?: string | number
  [key: string]: unknown
}
