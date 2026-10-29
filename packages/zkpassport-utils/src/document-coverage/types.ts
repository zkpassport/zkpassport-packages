/**
 * The document coverage table: for each country, the documents it issues, how each can be read
 * and whether we can verify what is read. Built by the coverage publisher, served from the CDN,
 * with a copy bundled here for when the CDN can't be reached.
 */

export type CoverageShapeKey = "booklet" | "card"
export type CoverageDocumentType =
  "passport" | "id_card" | "residence_permit" | "my_number_card" | "aadhaar"
export type ReadMethod = "nfc" | "camera" | "qr"

export interface CoverageShape {
  /** Width over height of the page or card the camera frames */
  aspectRatio: number
  orientation: "landscape" | "portrait"
}

export interface CoverageReadMethod {
  /** The document field that must be true for the method to apply; absent means always */
  requires?: "chip" | "mrz"
  /** The credential schemes a read by this method can produce */
  schemes: number[]
}

export interface CoverageDocumentTypeRule {
  /** What to call the document in a picker, e.g. "National ID" or "Aadhaar" */
  name: string
  shape: CoverageShapeKey
  read: Partial<Record<ReadMethod, CoverageReadMethod>>
}

export interface CoverageDocument {
  type: CoverageDocumentType
  name: string
  /** First and last year of issue, when known */
  from?: number
  to?: number
  chip: boolean
  mrz: boolean
  /** Regula no longer maintains the template; the document is still in circulation */
  deprecated?: true
  /** Listed ahead of our support for it */
  available?: false
  regulaId?: number
}

export interface CoverageCountry {
  name: string
  /** Certificates in our registry whose signatures our circuits verify, and the years they cover */
  chipCertificates: { supported: boolean; from: number | null; to: number | null }
  /** Our document support rules, 0 (none) to 1 (full) */
  signedSupport: { passport: number; id_card: number; residence_permit: number }
  documents: CoverageDocument[]
}

export interface Coverage {
  schemaVersion: 1
  generatedAt: string
  sources: {
    regula: { database: string; build: number; documents: number }
    certificates: { chainId: number; root: string; count: number }
  }
  shapes: Record<CoverageShapeKey, CoverageShape>
  documentTypes: Record<CoverageDocumentType, CoverageDocumentTypeRule>
  countries: Record<string, CoverageCountry>
}
