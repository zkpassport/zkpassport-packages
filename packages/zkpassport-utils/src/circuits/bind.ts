import { leftPadArrayWithZeros, packBeBytesIntoField, rightPadArrayWithZeros } from "../utils"
import { BindCommittedInputs, BoundData, Query } from "../types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { sha256 } from "@noble/hashes/sha2"
import { ProofType } from "."
import { Binary } from "../binary"

export function getBoundDataFromCommittedInputs(committedInputs: BindCommittedInputs): BoundData {
  return committedInputs.data
}

/**
 * Get the number of public inputs for the bind proof.
 * @returns The number of public inputs.
 */
export function getBindProofPublicInputCount(): number {
  return 5
}

export enum BoundDataIdentifier {
  USER_ADDRESS = 1,
  CUSTOM_DATA = 2,
}

export function formatBoundData(boundData: BoundData): number[] {
  let data: number[] = []
  // Use a tag length logic to encode the data
  if (boundData.user_address && boundData.user_address.length > 0) {
    // The user address is treated as a hex string
    const userAddress = Binary.fromHex(boundData.user_address).toNumberArray()
    data = [
      ...data,
      BoundDataIdentifier.USER_ADDRESS,
      // The length of the user address is encoded as a 2-byte number
      ...leftPadArrayWithZeros([userAddress.length], 2),
      ...userAddress,
    ]
  }
  if (boundData.custom_data && boundData.custom_data.length > 0) {
    // The custom data is treated as a regular string of characters
    // and encoded as UTF-8
    const customData = new TextEncoder().encode(boundData.custom_data)
    data = [
      ...data,
      BoundDataIdentifier.CUSTOM_DATA,
      // The length of the custom data is encoded as a 2-byte number
      ...[(customData.length >> 8) & 0xff, customData.length & 0xff],
      ...customData,
    ]
  }
  if (data.length > 500) {
    throw new Error(`Data is too long: ${data.length} > 500`)
  }
  return data
}

/**
 * Get the parameter commitment for the bind proof.
 * @param data - The data to bind to.
 * @param expectedHash - The expected hash of the data.
 * @returns The parameter commitment.
 */
export async function getBindParameterCommitment(
  data: number[],
  maxLength: number = 500,
): Promise<bigint> {
  const paddedDataBytes = rightPadArrayWithZeros(data, maxLength)
  const bindParameterCommitment = await poseidon2HashAsync([
    BigInt(ProofType.BIND),
    ...paddedDataBytes.map((x) => BigInt(x)),
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
  maxLength: number = 500,
): Promise<bigint> {
  const paddedDataBytes = rightPadArrayWithZeros(data, maxLength)
  const hash = sha256(new Uint8Array([ProofType.BIND, ...paddedDataBytes]))
  const hashBigInt = packBeBytesIntoField(hash, 31)
  return hashBigInt
}
