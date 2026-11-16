import { sha256 } from "@noble/hashes/sha2.js"
import { ProofType, ProofTypeLength } from "."
import { numberToBytesBE, packBeBytesIntoField } from "../utils"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { hasVerificationMethod } from "./verification-method"

// The little-endian packed and poseidon2 hashed Google Play Integrity pubkey
// Hardcoded here since it is not expected to change
export const GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH =
  8544227306600425492560068004835614964118871262589609739238120993689090208159n

const ANDROID_APP_ID_HASH = 0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615dn

// What a face match committed before it had a revocation root: one field, or 32 bytes, fewer
const PRE_REVOCATION_ROOT_LENGTH = { evm: 98, standard: 5 }

/**
 * Whether face match proofs of a circuit version commit an attestation revocation root. The root
 * arrived with the verification method, in circuits 0.23.0; a proof that states no version is
 * read as older.
 */
export function commitsAttestationRevocationRoot(circuitVersion?: string): boolean {
  return hasVerificationMethod(circuitVersion)
}

/** How long a face match's committed inputs are, type and length prefix aside */
export function getFacematchCommittedInputLength(commitsRevocationRoot: boolean = true) {
  return commitsRevocationRoot ? ProofTypeLength[ProofType.FACEMATCH] : PRE_REVOCATION_ROOT_LENGTH
}

/**
 * Get the parameter commitment for the facematch proof
 * @param rootKeyLeaf - Root key leaf
 * @param environment - Environment
 * @param appIdHash - Hash of the app id
 * @param facematchMode - Facematch mode
 * @param integrityAnchor - Android only: the Play Integrity key hash. 0 on iOS
 * @param revocationRoot - Android only: the attestation revocation tree root. 0 on iOS
 * @param commitsRevocationRoot - False for a proof of circuits before 0.23.0, see
 * {@link commitsAttestationRevocationRoot}
 * @returns Parameter commitment
 */
export async function getFacematchParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
  integrityAnchor: bigint = defaultIntegrityAnchor(appIdHash),
  revocationRoot: bigint = 0n,
  commitsRevocationRoot: boolean = true,
): Promise<bigint> {
  return parameterCommitment(
    ProofType.FACEMATCH,
    rootKeyLeaf,
    environment,
    appIdHash,
    facematchMode,
    integrityAnchor,
    commitsRevocationRoot ? revocationRoot : undefined,
  )
}

/**
 * Get the EVM parameter commitment for the facematch proof
 * @param rootKeyLeaf - Root key leaf
 * @param environment - Environment
 * @param appIdHash - Hash of the app id
 * @param facematchMode - Facematch mode
 * @param integrityAnchor - Android only: the Play Integrity key hash. 0 on iOS
 * @param revocationRoot - Android only: the attestation revocation tree root. 0 on iOS
 * @param commitsRevocationRoot - False for a proof of circuits before 0.23.0, see
 * {@link commitsAttestationRevocationRoot}
 * @returns Parameter commitment
 */
export async function getFacematchEvmParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
  integrityAnchor: bigint = defaultIntegrityAnchor(appIdHash),
  revocationRoot: bigint = 0n,
  commitsRevocationRoot: boolean = true,
): Promise<bigint> {
  return evmParameterCommitment(
    ProofType.FACEMATCH,
    rootKeyLeaf,
    environment,
    appIdHash,
    facematchMode,
    integrityAnchor,
    commitsRevocationRoot ? revocationRoot : undefined,
  )
}

/**
 * The parameter commitment of an attested_id proof: the face match parameters of its device
 * attestation under their own proof type, so a verifier tells it apart from a face match proof
 */
export async function getAttestedIdParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
  integrityAnchor: bigint = defaultIntegrityAnchor(appIdHash),
  revocationRoot: bigint = 0n,
): Promise<bigint> {
  return parameterCommitment(
    ProofType.ATTESTED_ID,
    rootKeyLeaf,
    environment,
    appIdHash,
    facematchMode,
    integrityAnchor,
    revocationRoot,
  )
}

/** The EVM (SHA-256) form of {@link getAttestedIdParameterCommitment} */
export async function getAttestedIdEvmParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
  integrityAnchor: bigint = defaultIntegrityAnchor(appIdHash),
  revocationRoot: bigint = 0n,
): Promise<bigint> {
  return evmParameterCommitment(
    ProofType.ATTESTED_ID,
    rootKeyLeaf,
    environment,
    appIdHash,
    facematchMode,
    integrityAnchor,
    revocationRoot,
  )
}

/** The integrity anchor a face match or attested ID proof commits to when none is given */
function defaultIntegrityAnchor(appIdHash: bigint): bigint {
  // The Play Integrity key for the Android app, nothing for iOS
  return appIdHash === ANDROID_APP_ID_HASH ? GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH : 0n
}

function parameterCommitment(
  proofType: ProofType.FACEMATCH | ProofType.ATTESTED_ID,
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
  integrityAnchor: bigint,
  revocationRoot: bigint | undefined,
): Promise<bigint> {
  const length = committedLength(proofType, revocationRoot)
  return poseidon2HashAsync([
    BigInt(proofType),
    BigInt(length.standard),
    rootKeyLeaf,
    environment,
    appIdHash,
    integrityAnchor,
    facematchMode,
    ...(revocationRoot === undefined ? [] : [revocationRoot]),
  ])
}

function committedLength(
  proofType: ProofType.FACEMATCH | ProofType.ATTESTED_ID,
  revocationRoot: bigint | undefined,
) {
  return revocationRoot === undefined ? PRE_REVOCATION_ROOT_LENGTH : ProofTypeLength[proofType]
}

async function evmParameterCommitment(
  proofType: ProofType.FACEMATCH | ProofType.ATTESTED_ID,
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
  integrityAnchor: bigint,
  revocationRoot: bigint | undefined,
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([
      proofType,
      ...numberToBytesBE(committedLength(proofType, revocationRoot).evm, 2),
      ...numberToBytesBE(rootKeyLeaf, 32),
      ...numberToBytesBE(environment, 1),
      ...numberToBytesBE(appIdHash, 32),
      ...numberToBytesBE(integrityAnchor, 32),
      ...numberToBytesBE(facematchMode, 1),
      ...(revocationRoot === undefined ? [] : numberToBytesBE(revocationRoot, 32)),
    ]),
  )
  return packBeBytesIntoField(hash, 31)
}
