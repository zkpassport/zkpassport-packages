import { packBeBytesIntoField, rightPadArrayWithZeros } from "../utils"
import { BindCommittedInputs, BindData, Query } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { sha256 } from "@noble/hashes/sha2"
import { ProofType } from "."
import { Binary } from "../binary"

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

export enum BindDataIdentifier {
  USER_ADDRESS = 1,
}

export function getBindDataLength(identifier: BindDataIdentifier): number {
  switch (identifier) {
    case BindDataIdentifier.USER_ADDRESS:
      return 20
  }
}

export function formatBindData(bindData: BindData): number[] {
  let data: number[] = []
  // Use a tag length logic to encode the data
  if (bindData.user_address) {
    data = [
      BindDataIdentifier.USER_ADDRESS,
      getBindDataLength(BindDataIdentifier.USER_ADDRESS),
      ...Binary.fromHex(bindData.user_address).toNumberArray(),
    ]
  }
  return data
}

export async function getBindDataHash(
  data: number[],
  isEvm: boolean = false,
  maxLength: number = 500,
): Promise<bigint | number[]> {
  if (data.length > maxLength) {
    throw new Error(`Data is too long: ${data.length} > ${maxLength}`)
  }
  const paddedDataBytes = rightPadArrayWithZeros(data, maxLength)
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
  data: number[],
  expectedHash: bigint,
  maxLength: number = 500,
): Promise<bigint> {
  const paddedDataBytes = rightPadArrayWithZeros(data, maxLength)
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
  data: number[],
  expectedHash: number[],
  maxLength: number = 500,
): Promise<bigint> {
  const paddedDataBytes = rightPadArrayWithZeros(data, maxLength)
  const hash = sha256(new Uint8Array([ProofType.BIND, ...paddedDataBytes, ...expectedHash]))
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
