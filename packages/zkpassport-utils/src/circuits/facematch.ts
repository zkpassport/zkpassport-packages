import { sha256 } from "@noble/hashes/sha2.js"
import { ProofType, ProofTypeLength } from "."
import { numberToBytesBE, packBeBytesIntoField } from "../utils"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

// The little-endian packed and poseidon2 hashed Google Play Integrity pubkey
// Hardcoded here since it is not expected to change
export const GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH =
  8544227306600425492560068004835614964118871262589609739238120993689090208159n

const ANDROID_APP_ID_HASH = 0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615dn

/**
 * Get the parameter commitment for the facematch proof
 * @param rootKeyLeaf - Root key leaf
 * @param environment - Environment
 * @param appIdHash - Hash of the app id
 * @param facematchMode - Facematch mode
 * @returns Parameter commitment
 */
export async function getFacematchParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
): Promise<bigint> {
  return parameterCommitment(
    ProofType.FACEMATCH,
    rootKeyLeaf,
    environment,
    appIdHash,
    facematchMode,
  )
}

/**
 * Get the EVM parameter commitment for the facematch proof
 * @param rootKeyLeaf - Root key leaf
 * @param environment - Environment
 * @param appIdHash - Hash of the app id
 * @param facematchMode - Facematch mode
 * @returns Parameter commitment
 */
export async function getFacematchEvmParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
): Promise<bigint> {
  return evmParameterCommitment(
    ProofType.FACEMATCH,
    rootKeyLeaf,
    environment,
    appIdHash,
    facematchMode,
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
): Promise<bigint> {
  return parameterCommitment(
    ProofType.ATTESTED_ID,
    rootKeyLeaf,
    environment,
    appIdHash,
    facematchMode,
  )
}

/** The EVM (SHA-256) form of {@link getAttestedIdParameterCommitment} */
export async function getAttestedIdEvmParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
): Promise<bigint> {
  return evmParameterCommitment(
    ProofType.ATTESTED_ID,
    rootKeyLeaf,
    environment,
    appIdHash,
    facematchMode,
  )
}

// The Play Integrity key is only committed to on Android, otherwise it is 0
const integrityKeyHash = (appIdHash: bigint) =>
  appIdHash === ANDROID_APP_ID_HASH ? GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH : 0n

function parameterCommitment(
  proofType: ProofType.FACEMATCH | ProofType.ATTESTED_ID,
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
): Promise<bigint> {
  return poseidon2HashAsync([
    BigInt(proofType),
    BigInt(ProofTypeLength[proofType].standard),
    rootKeyLeaf,
    environment,
    appIdHash,
    integrityKeyHash(appIdHash),
    facematchMode,
  ])
}

async function evmParameterCommitment(
  proofType: ProofType.FACEMATCH | ProofType.ATTESTED_ID,
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([
      proofType,
      ...numberToBytesBE(ProofTypeLength[proofType].evm, 2),
      ...numberToBytesBE(rootKeyLeaf, 32),
      ...numberToBytesBE(environment, 1),
      ...numberToBytesBE(appIdHash, 32),
      ...numberToBytesBE(integrityKeyHash(appIdHash), 32),
      ...numberToBytesBE(facematchMode, 1),
    ]),
  )
  return packBeBytesIntoField(hash, 31)
}
