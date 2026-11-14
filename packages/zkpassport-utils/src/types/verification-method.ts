/**
 * The assurance tier of a credential: 1 when its issuer signed the data, 2 when a device attested
 * a capture of it. Tier 1 is schemes 100-199, tier 2 is schemes 200-299.
 */
export enum VerificationTier {
  GOVERNMENT_SIGNED = 1,
  DEVICE_ATTESTED = 2,
}

/**
 * How an ID's data was verified: what the base proof outputs and the outer proof re-exports as its
 * last public input (disclosure proofs carry none; their commitment ties them to the base proof). One value per scheme, never reused.
 * Zero is never valid, so a proof made before the field existed can't pass as a real scheme.
 */
export enum VerificationMethod {
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

/**
 * An entry of a service's credential policy: a tier, which stands for every scheme of that tier,
 * or one exact scheme. `[VerificationTier.GOVERNMENT_SIGNED, VerificationMethod.ATTESTED_CAPTURE_IOS]`
 * accepts any signed credential and a camera read attested on iOS.
 */
export type AllowedVerificationMethod = VerificationTier | VerificationMethod

/** What a service accepts unless it says otherwise: signed credentials only */
export const DEFAULT_ALLOWED_VERIFICATION_METHODS: readonly AllowedVerificationMethod[] =
  Object.freeze([VerificationTier.GOVERNMENT_SIGNED])

/** The tier of a scheme, by explicit range */
export function getTierForVerificationMethod(scheme: VerificationMethod): VerificationTier {
  if (scheme >= 100 && scheme < 200) return VerificationTier.GOVERNMENT_SIGNED
  if (scheme >= 200 && scheme < 300) return VerificationTier.DEVICE_ATTESTED
  throw new Error(`Verification method in no tier: ${scheme}`)
}

const isTier = (value: number): value is VerificationTier =>
  Object.values(VerificationTier).includes(value as VerificationTier)

const isScheme = (value: number): value is VerificationMethod =>
  Object.values(VerificationMethod).includes(value as VerificationMethod)

export function parseVerificationMethod(value: bigint | string | number): VerificationMethod {
  const scheme = Number(BigInt(value))
  if (!isScheme(scheme)) {
    throw new Error(`Unknown verification method: ${value}`)
  }
  return scheme
}

export function parseAllowedVerificationMethod(
  value: bigint | string | number,
): AllowedVerificationMethod {
  const entry = Number(BigInt(value))
  if (!isTier(entry) && !isScheme(entry)) {
    throw new Error(`Unknown verification tier or scheme: ${value}`)
  }
  return entry
}

/** Whether the policy accepts a scheme; no policy means the default one */
export function isVerificationMethodAllowed(
  scheme: VerificationMethod,
  allowed: readonly AllowedVerificationMethod[] = DEFAULT_ALLOWED_VERIFICATION_METHODS,
): boolean {
  const tier = getTierForVerificationMethod(scheme)
  return allowed.some((entry) => entry === scheme || entry === tier)
}

/** Every scheme a policy accepts, with tiers expanded */
export function expandAllowedVerificationMethods(
  allowed: readonly AllowedVerificationMethod[] = DEFAULT_ALLOWED_VERIFICATION_METHODS,
): VerificationMethod[] {
  const schemes = Object.values(VerificationMethod).filter(
    (value): value is VerificationMethod => typeof value === "number",
  )
  return schemes.filter((scheme) => isVerificationMethodAllowed(scheme, allowed))
}

/** The policy as it travels in a request URL, e.g. "1,201" */
export function serializeAllowedVerificationMethods(
  allowed: readonly AllowedVerificationMethod[],
): string {
  return allowed.map((entry) => parseAllowedVerificationMethod(entry)).join(",")
}

export function parseAllowedVerificationMethods(
  value: string | null | undefined,
): AllowedVerificationMethod[] | null {
  if (value == null || value === "") return null
  return value.split(",").map((entry) => parseAllowedVerificationMethod(entry.trim()))
}
