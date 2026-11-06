import { sha256 } from "@noble/hashes/sha2.js"
import { ProofType, ProofTypeLength } from "."
import { numberToBytesBE, packBeBytesIntoField } from "../utils"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

// The little-endian packed and poseidon2 hashed Google Play Integrity pubkey
// Hardcoded here since it is not expected to change
export const GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH =
  8544227306600425492560068004835614964118871262589609739238120993689090208159n

const ANDROID_APP_ID_HASH = 0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615dn

/** The integrity anchor a face match or attested ID proof commits to when none is given */
function defaultIntegrityAnchor(appIdHash: bigint): bigint {
  // The Play Integrity key for the Android app, nothing for iOS
  return appIdHash === ANDROID_APP_ID_HASH ? GOOGLE_PLAY_INTEGRITY_PUBKEY_HASH : 0n
}

/**
 * Get the parameter commitment for the facematch proof (and the attested ID proof, which
 * commits to the same parameters)
 * @param rootKeyLeaf - Root key leaf
 * @param environment - Environment
 * @param appIdHash - Hash of the app id
 * @param facematchMode - Facematch mode
 * @param integrityAnchor - Android only: the Play Integrity key hash, or the hardware attestation
 * anchor over the boot key allowlist and the APK signing digest. 0 on iOS
 * @param revocationRoot - Android only: the attestation revocation tree root. 0 on iOS
 * @returns Parameter commitment
 */
export async function getFacematchParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
  integrityAnchor: bigint = defaultIntegrityAnchor(appIdHash),
  revocationRoot: bigint = 0n,
): Promise<bigint> {
  return poseidon2HashAsync([
    BigInt(ProofType.FACEMATCH),
    BigInt(ProofTypeLength[ProofType.FACEMATCH].standard),
    rootKeyLeaf,
    environment,
    appIdHash,
    integrityAnchor,
    facematchMode,
    revocationRoot,
  ])
}

/**
 * Get the EVM parameter commitment for the facematch proof
 * @param rootKeyLeaf - Root key leaf
 * @param environment - Environment
 * @param appIdHash - Hash of the app id
 * @param facematchMode - Facematch mode
 * @param integrityAnchor - As for getFacematchParameterCommitment
 * @param revocationRoot - As for getFacematchParameterCommitment
 * @returns Parameter commitment
 */
export async function getFacematchEvmParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appIdHash: bigint,
  facematchMode: bigint,
  integrityAnchor: bigint = defaultIntegrityAnchor(appIdHash),
  revocationRoot: bigint = 0n,
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([
      ProofType.FACEMATCH,
      ...numberToBytesBE(ProofTypeLength[ProofType.FACEMATCH].evm, 2),
      ...numberToBytesBE(rootKeyLeaf, 32),
      ...numberToBytesBE(environment, 1),
      ...numberToBytesBE(appIdHash, 32),
      ...numberToBytesBE(integrityAnchor, 32),
      ...numberToBytesBE(facematchMode, 1),
      ...numberToBytesBE(revocationRoot, 32),
    ]),
  )
  return packBeBytesIntoField(hash, 31)
}
