import { CredentialScheme, PassportViewModel, ProofResult } from "../types"
import { parseCredentialScheme } from "../types/credential"
import { getProofData } from "../proof-parser"
import { isChiplessPassport } from "./attested-id"
import { getNumberOfPublicInputs, ProofData } from "./index"

export {
  CredentialScheme,
  CredentialTier,
  DEFAULT_ALLOWED_CREDENTIALS,
  allowedCredentialScheme,
  applyCredentialPolicyToQuery,
  credentialRuleFor,
  getTierForCredentialScheme,
  isAllowedCredentialRule,
  isCredentialAllowed,
  expandAllowedCredentials,
  parseAllowedCredentialRule,
  parseCredentialRules,
  parseCredentialScheme,
  parseAllowedCredential,
  parseAllowedCredentials,
  serializeAllowedCredentials,
  serializeCredentialRules,
  validateAllowedCredentials,
} from "../types/credential"
export type {
  AllowedCredential,
  AllowedCredentialRule,
  CredentialDocumentType,
  CredentialSubject,
} from "../types/credential"

/** The first circuit version whose proofs carry the credential scheme */
export const CREDENTIAL_SCHEME_CIRCUIT_VERSION = "0.22.0"

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => Number(x))
  const pb = b.split(".").map((x) => Number(x))
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Whether proofs of a circuit version carry the credential scheme. Proofs always state their
 * version; one without is from before the field existed and is read with the older layout.
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

// Layouts: a disclosure proof's 9th public input, the integrity proof's 3rd output, the
// attested ID proof's 3rd output, the outer proof's last public input.

export function getCredentialSchemeFromDisclosureProof(
  proofData: ProofData,
): CredentialScheme | undefined {
  return proofData.publicInputs.length > 8
    ? parseCredentialScheme(proofData.publicInputs[8])
    : undefined
}

export function getCredentialSchemeFromIntegrityProof(
  proofData: ProofData,
): CredentialScheme | undefined {
  return proofData.publicInputs.length > 2
    ? parseCredentialScheme(proofData.publicInputs[2])
    : undefined
}

export function getCredentialSchemeFromAttestedIdProof(proofData: ProofData): CredentialScheme {
  return parseCredentialScheme(proofData.publicInputs[2])
}

export function getCredentialSchemeFromOuterProof(proofData: ProofData): CredentialScheme {
  return parseCredentialScheme(proofData.publicInputs[proofData.publicInputs.length - 1])
}

/**
 * The scheme a set of proofs was made under, read from the first proof that states it: the
 * outer proof, the attested ID or integrity base proof, else a disclosure proof. Proofs from
 * before the field existed came from a chip. The public input checker then holds every proof
 * to the scheme it finds itself, so a wrong answer here only makes the check fail.
 */
export function getCredentialSchemeFromProofs(proofs: ProofResult[]): CredentialScheme {
  for (const proof of proofs) {
    const name = proof.name ?? ""
    if (!proof.proof || name.startsWith("sig_check")) continue
    try {
      const proofData = getProofData(proof.proof, getNumberOfPublicInputs(name, proof.version))
      if (name.startsWith("outer")) {
        return hasCredentialScheme(proof.version)
          ? getCredentialSchemeFromOuterProof(proofData)
          : CredentialScheme.ICAO_CHIP
      }
      if (name.startsWith("attested_id")) return getCredentialSchemeFromAttestedIdProof(proofData)
      if (name.startsWith("data_check_integrity")) {
        return getCredentialSchemeFromIntegrityProof(proofData) ?? CredentialScheme.ICAO_CHIP
      }
      if (hasCredentialScheme(proof.version)) {
        const scheme = getCredentialSchemeFromDisclosureProof(proofData)
        if (scheme) return scheme
      }
    } catch {
      continue
    }
  }
  return CredentialScheme.ICAO_CHIP
}
