import { packBeBytesIntoField, rightPadArrayWithZeros } from "../utils"
import { BindCommittedInputs, BindData, Query } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { sha256 } from "@noble/hashes/sha2"
import { ProofType } from "."

export function getBindDataFromCommittedInputs(committedInputs: BindCommittedInputs): BindData {
  return committedInputs.data
}

export function getBindDataHashFromCommittedInputs(committedInputs: BindCommittedInputs): bigint {
  return BigInt(committedInputs.expected_hash)
}

/**
 * Get the number of public inputs for the bind proof.
 * @returns The number of public inputs.
 */
export function getBindProofPublicInputCount(): number {
  return 5
}

export function formatBindData(bindData: BindData): string {
  let data = ""
  if (bindData.user_address) {
    data = `user_address:${bindData.user_address}`
  }
  return data
}

export async function getBindDataHash(
  data: string,
  isEvm: boolean = false,
  maxLength: number = 500,
): Promise<bigint | number[]> {
  const dataBytes = Array.from(new TextEncoder().encode(data))
  if (dataBytes.length > maxLength) {
    throw new Error(`Data is too long: ${dataBytes.length} > ${maxLength}`)
  }
  const paddedDataBytes = rightPadArrayWithZeros(dataBytes, maxLength)
  if (isEvm) {
    return Array.from(sha256(new Uint8Array(paddedDataBytes)))
  }
  return await poseidon2HashAsync(paddedDataBytes.map((b) => BigInt(b)))
}

/**
 * Get the parameter commitment for the bind proof.
 * @param data - The data to bind to.
 * @param expectedHash - The expected hash of the data.
 * @returns The parameter commitment.
 */
export async function getBindParameterCommitment(
  data: string,
  expectedHash: bigint,
  maxLength: number = 500,
): Promise<bigint> {
  const dataBytes = Array.from(new TextEncoder().encode(data))
  const paddedDataBytes = rightPadArrayWithZeros(dataBytes, maxLength)
  const bindParameterCommitment = await poseidon2HashAsync([
    BigInt(ProofType.BIND),
    ...paddedDataBytes.map((x) => BigInt(x)),
    expectedHash,
  ])
  return bindParameterCommitment
}

/**
 * Get the EVM parameter commitment for the bind proof.
 * @param data - The data to bind to.
 * @param expectedHash - The expected hash of the data.
 * @returns The parameter commitment.
 */
export async function getBindEVMParameterCommitment(
  data: string,
  expectedHash: number[],
  maxLength: number = 500,
): Promise<bigint> {
  const dataBytes = Array.from(new TextEncoder().encode(data))
  const paddedDataBytes = rightPadArrayWithZeros(dataBytes, maxLength)
  const hash = sha256(new Uint8Array([ProofType.BIND, ...paddedDataBytes, ...expectedHash]))
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
