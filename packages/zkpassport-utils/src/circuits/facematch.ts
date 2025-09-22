import { ProofType } from "."
import { poseidon2HashAsync } from "@zkpassport/poseidon2"

/**
 * Get the parameter commitment for the facematch proof
 * @param rootKeyLeaf - The root key leaf
 * @param environment - Environment
 * @param appId - app id
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
 * @param rootKeyLeaf - The root key leaf
 * @param environment - Environment
 * @param appId - app id
 * @param facematchMode - Facematch mode
 * @returns Parameter commitment
 */
// export async function getFacematchParameterCommitmentEVM(
//   rootKeyLeaf: bigint,
//   environment: bigint,
//   appId: bigint,
//   facematchMode: bigint,
// ): Promise<bigint> {
//   const hash = sha256(
//     new Uint8Array([
//       ProofType.FACEMATCH,
//       ...
//     ]),
//   )
//   const hashBigInt = packLeBytesIntoField(hash, 31)
//   return hashBigInt
// }
