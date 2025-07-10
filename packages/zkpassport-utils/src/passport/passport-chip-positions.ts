// Mapping of ISO 3-letter country codes to passport chip positions
// Based on comprehensive research of international e-passport implementations

export type ChipPosition =
  | "front_cover" // Chip embedded in front cover
  | "back_cover" // Chip embedded in back cover
  | "data_page" // Chip embedded in polycarbonate data page
  | "inside_cover" // Chip embedded in inside cover/inlay
  | "unknown" // Position not documented/unknown

export type ChipPositionPeriod = {
  from: Date // Start date of this chip position period
  to: Date | null // End date (null = current)
  position: ChipPosition
  notes?: string // Optional notes about the change
  hasProtectiveShield?: boolean // Whether the chip is protected by a protective shield
}

export type CountryChipInfo = {
  periods: ChipPositionPeriod[]
}

export const PASSPORT_CHIP_POSITIONS: Record<string, CountryChipInfo> = {
  AUT: {
    periods: [
      { from: new Date("2006-06-01"), to: new Date("2014-01-01"), position: "back_cover" },
      {
        from: new Date("2014-01-01"),
        to: null,
        position: "data_page",
        notes: "Austria started using polycarbonate data page in on January 1st, 2014",
      },
    ],
  },
  BEL: {
    periods: [
      { from: new Date("2006-01-01"), to: new Date("2021-01-01"), position: "back_cover" },
      {
        from: new Date("2021-01-01"),
        to: null,
        position: "data_page",
        notes: "Belgium started using polycarbonate data page in 2021",
      },
    ],
  },
  DEU: {
    periods: [
      { from: new Date("2005-11-01"), to: new Date("2017-03-01"), position: "back_cover" },
      {
        from: new Date("2017-03-01"),
        to: null,
        position: "data_page",
        notes: "Germany started using polycarbonate data page in on March 1st, 2017",
      },
    ],
  },
  ITA: {
    periods: [{ from: new Date("2006-10-26"), to: null, position: "back_cover" }],
  },
  NLD: {
    periods: [
      { from: new Date("2006-08-01"), to: new Date("2014-01-01"), position: "back_cover" },
      {
        from: new Date("2014-01-01"),
        to: null,
        position: "data_page",
        notes: "Netherlands started using polycarbonate data page in 2014",
      },
    ],
  },
  FRA: {
    periods: [{ from: new Date("2006-01-01"), to: null, position: "back_cover" }],
  },
  ESP: {
    periods: [
      { from: new Date("2006-08-01"), to: new Date("2021-01-01"), position: "back_cover" },
      {
        from: new Date("2021-01-01"),
        to: null,
        position: "data_page",
        notes: "Spain started using polycarbonate data page in 2021",
      },
    ],
  },
  SWE: {
    periods: [{ from: new Date("2005-10-01"), to: null, position: "data_page" }],
  },
  GBR: {
    periods: [
      { from: new Date("2006-02-06"), to: new Date("2020-03-10"), position: "back_cover" },
      {
        from: new Date("2020-03-10"),
        to: null,
        position: "data_page",
        notes: "UK started using polycarbonate data page on March 10th, 2020",
      },
    ],
  },
  RUS: {
    periods: [{ from: new Date("2006-01-01"), to: null, position: "data_page" }],
  },
  TUR: {
    periods: [
      { from: new Date("2010-01-01"), to: new Date("2022-01-01"), position: "back_cover" },
      {
        from: new Date("2022-01-01"),
        to: null,
        position: "data_page",
        notes: "Turkey started using polycarbonate data page in 2022",
      },
    ],
  },
  UKR: {
    periods: [{ from: new Date("2015-01-01"), to: null, position: "data_page" }],
  },
  VAT: {
    periods: [{ from: new Date("2006-01-01"), to: null, position: "data_page" }],
  },
  USA: {
    periods: [
      {
        from: new Date("2006-01-01"),
        to: new Date("2021-01-01"),
        position: "back_cover",
        hasProtectiveShield: true,
      },
      {
        from: new Date("2021-03-01"),
        to: null,
        position: "data_page",
        notes: "USA started using polycarbonate data page in on March 1st, 2021",
        hasProtectiveShield: true,
      },
    ],
  },
  CAN: {
    periods: [
      { from: new Date("2013-07-01"), to: new Date("2023-05-18"), position: "back_cover" },
      {
        from: new Date("2023-05-18"),
        to: null,
        position: "data_page",
        notes: "Canada started using polycarbonate data page in 2023",
      },
    ],
  },
  MEX: {
    periods: [
      { from: new Date("2006-01-01"), to: new Date("2021-01-01"), position: "back_cover" },
      {
        from: new Date("2021-01-01"),
        to: null,
        position: "data_page",
        notes: "Mexico started using polycarbonate data page recently (actual date unknown)",
      },
    ],
  },
  ARG: {
    periods: [{ from: new Date("2012-06-01"), to: null, position: "back_cover" }],
  },
  BOL: {
    periods: [{ from: new Date("2019-02-02"), to: null, position: "data_page" }],
  },
  BRA: {
    periods: [
      { from: new Date("2011-01-01"), to: new Date("2015-01-01"), position: "back_cover" },
      {
        from: new Date("2015-01-01"),
        to: null,
        position: "data_page",
        notes: "Brazil started using polycarbonate data page in 2015",
      },
    ],
  },
  CHL: {
    periods: [
      { from: new Date("2013-09-02"), to: new Date("2022-01-01"), position: "back_cover" },
      {
        from: new Date("2022-01-01"),
        to: null,
        position: "data_page",
        notes: "Chile started using polycarbonate data page recently (actual date unknown)",
      },
    ],
  },
  COL: {
    periods: [{ from: new Date("2015-09-01"), to: null, position: "data_page" }],
  },
  ECU: {
    periods: [{ from: new Date("2020-09-14"), to: null, position: "data_page" }],
  },
  PRY: {
    periods: [
      { from: new Date("2010-01-01"), to: new Date("2015-01-01"), position: "back_cover" },
      {
        from: new Date("2015-01-01"),
        to: null,
        position: "data_page",
        notes: "Paraguay started using polycarbonate data page recently (actual date unknown)",
      },
    ],
  },
  PER: {
    periods: [{ from: new Date("2016-02-26"), to: null, position: "data_page" }],
  },
  URY: {
    periods: [
      { from: new Date("2015-10-16"), to: new Date("2023-01-01"), position: "back_cover" },
      {
        from: new Date("2023-01-01"),
        to: null,
        position: "data_page",
        notes: "Uruguay started using polycarbonate data page recently (actual date unknown)",
      },
    ],
  },
  VEN: {
    periods: [{ from: new Date("2007-07-01"), to: null, position: "back_cover" }],
  },
  AUS: {
    periods: [{ from: new Date("2005-09-01"), to: null, position: "data_page" }],
  },
  NZL: {
    periods: [{ from: new Date("2005-10-01"), to: null, position: "data_page" }],
  },
  PNG: {
    periods: [{ from: new Date("2016-01-01"), to: null, position: "data_page" }],
  },
  DZA: {
    periods: [{ from: new Date("2012-01-05"), to: null, position: "data_page" }],
  },
  KEN: {
    periods: [{ from: new Date("2017-09-01"), to: null, position: "data_page" }],
  },
  MAR: {
    periods: [{ from: new Date("2009-01-01"), to: null, position: "back_cover" }],
  },
  NGA: {
    periods: [{ from: new Date("2007-01-01"), to: null, position: "back_cover" }],
  },
  UGA: {
    periods: [{ from: new Date("2018-01-01"), to: null, position: "data_page" }],
  },
  BHR: {
    periods: [{ from: new Date("2023-03-20"), to: null, position: "data_page" }],
  },
  BGD: {
    periods: [{ from: new Date("2020-01-01"), to: null, position: "data_page" }],
  },
  CHN: {
    periods: [{ from: new Date("2012-05-15"), to: null, position: "data_page" }],
  },
  IND: {
    periods: [{ from: new Date("2025-05-01"), to: null, position: "data_page" }],
  },
  IDN: {
    periods: [
      { from: new Date("2006-01-01"), to: new Date("2022-01-01"), position: "back_cover" },
      {
        from: new Date("2022-01-01"),
        to: null,
        position: "data_page",
        notes: "Indonesia started using polycarbonate data page recently (actual date unknown)",
      },
    ],
  },
  ISR: {
    periods: [{ from: new Date("2013-07-01"), to: null, position: "back_cover" }],
  },
  JPN: {
    periods: [{ from: new Date("2006-03-01"), to: null, position: "back_cover" }],
  },
  MYS: {
    periods: [
      { from: new Date("2010-02-02"), to: new Date("2013-01-01"), position: "back_cover" },
      {
        from: new Date("2013-01-01"),
        to: null,
        position: "data_page",
        notes:
          "Malaysia started using polycarbonate data page recently in 2013. The first electronic passports issued by Malaysia in 1998 were not ICAO compliant, only readable by the Malaysian authorities.",
      },
    ],
  },
  MDV: {
    periods: [{ from: new Date("2006-07-26"), to: null, position: "back_cover" }],
  },
  NPL: {
    periods: [{ from: new Date("2021-01-01"), to: null, position: "data_page" }],
  },
  PAK: {
    periods: [{ from: new Date("2023-06-10"), to: null, position: "data_page" }],
  },
  PHL: {
    periods: [{ from: new Date("2009-08-11"), to: null, position: "back_cover" }],
  },
  SAU: {
    periods: [{ from: new Date("2022-02-10"), to: null, position: "data_page" }],
  },
  SGP: {
    periods: [{ from: new Date("2006-08-15"), to: null, position: "back_cover" }],
  },
  KOR: {
    periods: [
      { from: new Date("2008-08-25"), to: new Date("2021-12-01"), position: "back_cover" },
      {
        from: new Date("2021-12-01"),
        to: null,
        position: "data_page",
        notes: "South Korea started using polycarbonate data page in December 2021",
      },
    ],
  },
  TWN: {
    periods: [{ from: new Date("2008-12-29"), to: null, position: "back_cover" }],
  },
  TJK: {
    periods: [{ from: new Date("2010-02-01"), to: null, position: "back_cover" }],
  },
  THA: {
    periods: [{ from: new Date("2005-08-01"), to: null, position: "back_cover" }],
  },
  TKM: {
    periods: [{ from: new Date("2008-07-10"), to: null, position: "back_cover" }],
  },
  ARE: {
    periods: [
      { from: new Date("2011-12-11"), to: new Date("2023-01-01"), position: "back_cover" },
      {
        from: new Date("2023-01-01"),
        to: null,
        position: "data_page",
        notes:
          "United Arab Emirates started using polycarbonate data page recently (actual date unknown)",
      },
    ],
  },
  UZB: {
    periods: [{ from: new Date("2011-01-01"), to: null, position: "back_cover" }],
  },
  VNM: {
    periods: [{ from: new Date("2023-03-01"), to: null, position: "data_page" }],
  },
  // TODO: Add more countries and check if the above is correct
}

// Helper function to get chip position for a country with date consideration
export function getChipPosition(countryCode: string, estimatedIssueDate?: Date): ChipPosition {
  const countryInfo = PASSPORT_CHIP_POSITIONS[countryCode.toUpperCase()]
  if (!countryInfo) return "unknown"

  // If no date provided, return current position
  if (!estimatedIssueDate) {
    return countryInfo.periods[countryInfo.periods.length - 1].position
  }

  // Find the appropriate period for the estimated issue date
  for (const period of countryInfo.periods) {
    if (
      estimatedIssueDate >= period.from &&
      (period.to === null || estimatedIssueDate < period.to)
    ) {
      return period.position
    }
  }

  // Fallback to most recent period
  return countryInfo.periods[countryInfo.periods.length - 1].position
}

// Helper function to extract expiry date from MRZ and estimate issue date
export function estimatePassportIssueDate(mrzData: string): Date | null {
  if (!mrzData) return null

  try {
    const lines = mrzData.split("\n")
    let expiryDateStr = ""

    // Extract expiry date based on document format
    if (lines.length >= 2 && lines[0].startsWith("P")) {
      // TD3 format (passport) - expiry date is positions 65-70 in line 2
      const line2 = lines[1].trim()
      if (line2.length >= 71) {
        expiryDateStr = line2.substring(65, 71)
      }
    } else if (
      lines.length >= 3 &&
      (lines[0].startsWith("I") || lines[0].startsWith("A") || lines[0].startsWith("C"))
    ) {
      // TD1 format (ID card) - expiry date is positions 8-13 in line 2
      const line2 = lines[1].trim()
      if (line2.length >= 14) {
        expiryDateStr = line2.substring(8, 14)
      }
    }

    if (expiryDateStr && /^\d{6}$/.test(expiryDateStr)) {
      // Parse YYMMDD format
      const year = parseInt(expiryDateStr.substring(0, 2))
      const month = parseInt(expiryDateStr.substring(2, 4)) - 1 // Month is 0-indexed
      const day = parseInt(expiryDateStr.substring(4, 6))

      // Handle Y2K - assume years 00-30 are 2000s, 31-99 are 1900s
      const fullYear = year <= 30 ? 2000 + year : 1900 + year

      const expiryDate = new Date(fullYear, month, day)

      // Estimate issue date by subtracting 10 years (typical adult passport validity)
      const estimatedIssueDate = new Date(expiryDate)
      estimatedIssueDate.setFullYear(estimatedIssueDate.getFullYear() - 10)

      return estimatedIssueDate
    }
  } catch (error) {
    console.warn("Failed to parse expiry date from MRZ:", error)
  }

  return null
}

// Helper function to get human-readable position description
export function getChipPositionDescription(
  position: ChipPosition,
  t: (key: string) => string,
): string {
  switch (position) {
    case "front_cover":
      return t("scanning.chipPositions.front_cover")
    case "back_cover":
      return t("scanning.chipPositions.back_cover")
    case "data_page":
      return t("scanning.chipPositions.data_page")
    case "inside_cover":
      return t("scanning.chipPositions.inside_cover")
    case "unknown":
    default:
      return t("scanning.chipPositions.unknown")
  }
}
