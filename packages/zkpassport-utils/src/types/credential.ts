/**
 * The assurance tier of a credential: 1 when its issuer signed the data, 2 when a device attested
 * a capture of it. The tier is the hundreds digit of the scheme.
 */
export enum CredentialTier {
  GOVERNMENT_SIGNED = 1,
  DEVICE_ATTESTED = 2,
}

/**
 * How an ID's data was verified: what the base proofs output, every disclosure proof carries as
 * its last public input, and the outer proof re-exports. One value per scheme, never reused.
 * Zero is never valid, so a proof made before the field existed can't pass as a real scheme.
 */
export enum CredentialScheme {
  /** The eMRTD chip, signed by the issuing country (CSCA -> DSC): passports and ICAO ID cards */
  ICAO_CHIP = 100,
  /** Aadhaar, signed by UIDAI */
  UIDAI_AADHAAR = 101,
  /** Japan's My Number card, JPKI chain */
  JPKI = 102,
  /** ISO 18013-5 mDoc (mDL, EUDI), IACA -> document signer */
  ISO_MDOC = 103,
  /** The data page read by camera on iOS, attested by App Attest with a strict face match */
  ATTESTED_CAPTURE_IOS = 200,
  /** The data page read by camera on Android, attested by Play Integrity with a strict face match */
  ATTESTED_CAPTURE_ANDROID = 201,
  /**
   * The chip read on iOS but its signature not verifiable (no certificate for it in the registry),
   * attested by App Attest with a strict face match. Reserved; no circuit proves it yet.
   */
  ATTESTED_CHIP_READ_IOS = 202,
  /** The same read on Android, attested by Play Integrity. Reserved; no circuit proves it yet. */
  ATTESTED_CHIP_READ_ANDROID = 203,
}

const SCHEMES_PER_TIER = 100

/**
 * An entry of a service's credential policy: a tier, which stands for every scheme of that tier,
 * or one exact scheme. `[CredentialTier.GOVERNMENT_SIGNED, CredentialScheme.ATTESTED_CAPTURE_IOS]`
 * accepts any signed credential and a camera read attested on iOS.
 */
export type AllowedCredential = CredentialTier | CredentialScheme

/** What a service accepts unless it says otherwise: signed credentials only */
export const DEFAULT_ALLOWED_CREDENTIALS: readonly AllowedCredential[] = [
  CredentialTier.GOVERNMENT_SIGNED,
]

export function getTierForCredentialScheme(scheme: CredentialScheme): CredentialTier {
  return Math.floor(scheme / SCHEMES_PER_TIER) as CredentialTier
}

const isTier = (value: number): value is CredentialTier =>
  Object.values(CredentialTier).includes(value as CredentialTier)

const isScheme = (value: number): value is CredentialScheme =>
  Object.values(CredentialScheme).includes(value as CredentialScheme)

export function parseCredentialScheme(value: bigint | string | number): CredentialScheme {
  const scheme = Number(BigInt(value))
  if (!isScheme(scheme)) {
    throw new Error(`Unknown credential scheme: ${value}`)
  }
  return scheme
}

export function parseAllowedCredential(value: bigint | string | number): AllowedCredential {
  const entry = Number(BigInt(value))
  if (!isTier(entry) && !isScheme(entry)) {
    throw new Error(`Unknown credential tier or scheme: ${value}`)
  }
  return entry
}

/** Whether the policy accepts a scheme; no policy means the default one */
export function isCredentialAllowed(
  scheme: CredentialScheme,
  allowed: readonly AllowedCredential[] = DEFAULT_ALLOWED_CREDENTIALS,
): boolean {
  const tier = getTierForCredentialScheme(scheme)
  return allowed.some((entry) => entry === scheme || entry === tier)
}

/** Every scheme a policy accepts, with tiers expanded */
export function expandAllowedCredentials(
  allowed: readonly AllowedCredential[] = DEFAULT_ALLOWED_CREDENTIALS,
): CredentialScheme[] {
  const schemes = Object.values(CredentialScheme).filter(
    (value): value is CredentialScheme => typeof value === "number",
  )
  return schemes.filter((scheme) => isCredentialAllowed(scheme, allowed))
}

/** The policy as it travels in a request URL, e.g. "1,201" */
export function serializeAllowedCredentials(allowed: readonly AllowedCredential[]): string {
  return allowed.map((entry) => parseAllowedCredential(entry)).join(",")
}

export function parseAllowedCredentials(
  value: string | null | undefined,
): AllowedCredential[] | null {
  if (value == null || value === "") return null
  return value.split(",").map((entry) => parseAllowedCredential(entry.trim()))
}
