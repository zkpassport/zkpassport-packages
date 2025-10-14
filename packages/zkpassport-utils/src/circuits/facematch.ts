import { sha256 } from "@noble/hashes/sha2"
import { ProofType } from "."
import { numberToBytesBE, packBeBytesIntoField } from "../utils"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

// The little-endian packed and poseidon2 hashed Google Play Integrity pubkey
// Hardcoded here since it is not expected to change
const GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH =
  8544227306600425492560068004835614964118871262589609739238120993689090208159n

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
  const parameterCommitment = await poseidon2HashAsync([
    BigInt(ProofType.FACEMATCH),
    rootKeyLeaf,
    environment,
    appIdHash,
    GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH,
    facematchMode,
  ])
  return parameterCommitment
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
  const hash = sha256(
    new Uint8Array([
      ProofType.FACEMATCH,
      ...numberToBytesBE(rootKeyLeaf, 32),
      ...numberToBytesBE(environment, 1),
      ...numberToBytesBE(appIdHash, 32),
      ...numberToBytesBE(GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH, 32),
      ...numberToBytesBE(facematchMode, 1),
    ]),
  )
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
