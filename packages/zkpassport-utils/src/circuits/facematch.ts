import { sha256 } from "@noble/hashes/sha2"
import { ProofType } from "."
import { numberToBytesBE, packBeBytesIntoField } from "../utils"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

/**
 * Get the parameter commitment for the facematch proof
 * @param rootKeyLeaf - Root key leaf
 * @param environment - Environment
 * @param appId - App id
 * @param facematchMode - Facematch mode
 * @returns Parameter commitment
 */
export async function getFacematchParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appId: bigint,
  facematchMode: bigint,
): Promise<bigint> {
  const parameterCommitment = await poseidon2HashAsync([
    BigInt(ProofType.FACEMATCH),
    rootKeyLeaf,
    environment,
    appId,
    facematchMode,
  ])
  return parameterCommitment
}

/**
 * Get the EVM parameter commitment for the facematch proof
 * @param rootKeyLeaf - Root key leaf
 * @param environment - Environment
 * @param appId - App id
 * @param facematchMode - Facematch mode
 * @returns Parameter commitment
 */
export async function getFacematchEvmParameterCommitment(
  rootKeyLeaf: bigint,
  environment: bigint,
  appId: bigint,
  facematchMode: bigint,
): Promise<bigint> {
  const hash = sha256(
    new Uint8Array([
      ProofType.FACEMATCH,
      ...numberToBytesBE(rootKeyLeaf, 32),
      ...numberToBytesBE(environment, 1),
      ...numberToBytesBE(appId, 32),
      ...numberToBytesBE(facematchMode, 1),
    ]),
  )
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
