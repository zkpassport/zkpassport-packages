import { VerificationMethod, PassportViewModel } from "../types"
import { parseVerificationMethod } from "../types/verification-method"
import { isChiplessPassport } from "./attested-id"
import { ProofData } from "./index"
import { getAttestedIdTrailingOutput, getOuterTrailingInput } from "./public-input-layout"

export {
  VerificationMethod,
  VerificationTier,
  DEFAULT_ALLOWED_VERIFICATION_METHODS,
  getTierForVerificationMethod,
  isVerificationMethodAllowed,
  expandAllowedVerificationMethods,
  parseVerificationMethod,
  parseAllowedVerificationMethod,
  parseAllowedVerificationMethods,
  serializeAllowedVerificationMethods,
} from "../types/verification-method"
export type { AllowedVerificationMethod } from "../types/verification-method"

/** The first circuit version whose proofs carry the verification method */
export const VERIFICATION_METHOD_CIRCUIT_VERSION = "0.23.0"

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
 * Whether proofs of a circuit version carry the verification method. Proofs always state their
 * version; one without is from before the field existed and is read with the older layout. A
 * verifier must not take that on the prover's word: it requires the version (`isCircuitVersion`).
 * Throws on a malformed version.
 */
export function hasVerificationMethod(circuitVersion?: string): boolean {
  if (!circuitVersion) return false
  return compareVersions(circuitVersion, VERIFICATION_METHOD_CIRCUIT_VERSION) >= 0
}

/**
 * The method an ID proves under: the one recorded when it was added, else its chip. A record saved
 * before the rename holds it as `credentialScheme`; a camera-read record from before either field
 * existed came from the iOS build, the only one that made them.
 */
export function getVerificationMethodForPassport(passport: PassportViewModel): VerificationMethod {
  if (passport.verificationMethod) return passport.verificationMethod
  const legacy = (passport as { credentialScheme?: VerificationMethod }).credentialScheme
  if (legacy) return legacy
  return isChiplessPassport(passport)
    ? VerificationMethod.ATTESTED_CAPTURE_IOS
    : VerificationMethod.ICAO_CHIP
}

/** The scheme as a circuit input */
export function verificationMethodToHex(scheme: VerificationMethod): string {
  return `0x${scheme.toString(16)}`
}

// Layouts: the integrity proof's 3rd output, the attested ID proof's 3rd output, the outer
// proof's last public input. Disclosure proofs carry no scheme: the commitment ties them to the
// base proof that states it.

export function getVerificationMethodFromIntegrityProof(
  proofData: ProofData,
): VerificationMethod | undefined {
  return proofData.publicInputs.length > 2
    ? parseVerificationMethod(proofData.publicInputs[2])
    : undefined
}

export function getVerificationMethodFromAttestedIdProof(proofData: ProofData): VerificationMethod {
  return parseVerificationMethod(
    getAttestedIdTrailingOutput(proofData.publicInputs, "verification_method"),
  )
}

/** The scheme an outer proof states: only one from circuit version 0.23.0 on has one */
export function getVerificationMethodFromOuterProof(proofData: ProofData): VerificationMethod {
  return parseVerificationMethod(
    getOuterTrailingInput(proofData.publicInputs, "verification_method", true),
  )
}
