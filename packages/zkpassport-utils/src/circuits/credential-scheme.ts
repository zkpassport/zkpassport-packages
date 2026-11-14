import { CredentialScheme, PassportViewModel } from "../types"
import { parseCredentialScheme } from "../types/credential"
import { isChiplessPassport } from "./attested-id"
import { ProofData } from "./index"

export {
  CredentialScheme,
  CredentialTier,
  DEFAULT_ALLOWED_CREDENTIALS,
  getTierForCredentialScheme,
  isCredentialAllowed,
  expandAllowedCredentials,
  parseCredentialScheme,
  parseAllowedCredential,
  parseAllowedCredentials,
  serializeAllowedCredentials,
} from "../types/credential"
export type { AllowedCredential } from "../types/credential"

/** The first circuit version whose proofs carry the credential scheme */
export const CREDENTIAL_SCHEME_CIRCUIT_VERSION = "0.23.0"

const CIRCUIT_VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/

/** Whether a circuit version is well formed: major.minor.patch, with an optional pre-release */
export function isCircuitVersion(circuitVersion: unknown): circuitVersion is string {
  return typeof circuitVersion === "string" && CIRCUIT_VERSION.test(circuitVersion)
}

// A pre-release counts as its release, so 0.23.0-rc.1 carries the scheme like 0.23.0 (as the Rust
// core reads it)
function versionParts(version: string): number[] {
  const match = CIRCUIT_VERSION.exec(version)
  if (!match) throw new Error(`Malformed circuit version: ${version}`)
  return match.slice(1, 4).map(Number)
}

function compareVersions(a: string, b: string): number {
  const pa = versionParts(a)
  const pb = versionParts(b)
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

/**
 * Whether proofs of a circuit version carry the credential scheme. Proofs always state their
 * version; one without is from before the field existed and is read with the older layout. A
 * verifier must not take that on the prover's word: it requires the version (`isCircuitVersion`).
 * Throws on a malformed version.
 */
export function hasCredentialScheme(circuitVersion?: string): boolean {
  if (!circuitVersion) return false
  return compareVersions(circuitVersion, CREDENTIAL_SCHEME_CIRCUIT_VERSION) >= 0
}

/**
 * The scheme an ID proves under: the one recorded when it was added, else its chip. A camera-read
 * record from before the field existed came from the iOS build, the only one that made them.
 */
export function getCredentialSchemeForPassport(passport: PassportViewModel): CredentialScheme {
  if (passport.credentialScheme) return passport.credentialScheme
  return isChiplessPassport(passport)
    ? CredentialScheme.ATTESTED_CAPTURE_IOS
    : CredentialScheme.ICAO_CHIP
}

/** The scheme as a circuit input */
export function credentialSchemeToHex(scheme: CredentialScheme): string {
  return `0x${scheme.toString(16)}`
}

// Layouts: the integrity proof's 3rd output, the attested ID proof's 3rd output, the outer
// proof's last public input. Disclosure proofs carry no scheme: the commitment ties them to the
// base proof that states it.

export function getCredentialSchemeFromIntegrityProof(
  proofData: ProofData,
): CredentialScheme | undefined {
  return proofData.publicInputs.length > 2
    ? parseCredentialScheme(proofData.publicInputs[2])
    : undefined
}

export function getCredentialSchemeFromAttestedIdProof(proofData: ProofData): CredentialScheme {
  return parseCredentialScheme(proofData.publicInputs[proofData.publicInputs.length - 1])
}

export function getCredentialSchemeFromOuterProof(proofData: ProofData): CredentialScheme {
  return parseCredentialScheme(proofData.publicInputs[proofData.publicInputs.length - 1])
}
