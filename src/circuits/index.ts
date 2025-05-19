import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { format } from "date-fns"
import {
  convertDateBytesToDate,
  getCountryExclusionProofPublicInputCount,
  getCountryInclusionProofPublicInputCount,
  getIDDataProofPublicInputCount,
} from ".."
import { Binary } from "../binary"
import {
  AgeCommittedInputs,
  DateCommittedInputs,
  DisclosureCircuitName,
  PackagedCircuit,
} from "../types"
import { getAgeProofPublicInputCount } from "./age"
import { getDateProofPublicInputCount } from "./date"
import {
  getDiscloseBytesProofPublicInputCount,
  getDiscloseFlagsProofPublicInputCount,
} from "./disclose"
import { getDSCProofPublicInputCount } from "./dsc"
import { getIntegrityProofPublicInputCount } from "./integrity"

export interface ProofData {
  publicInputs: string[]
  proof: string[]
}

export async function calculatePrivateNullifier(dg1: Binary, sodSig: Binary): Promise<Binary> {
  return Binary.from(
    await poseidon2HashAsync([
      ...Array.from(dg1).map((x) => BigInt(x)),
      ...Array.from(sodSig).map((x) => BigInt(x)),
    ]),
  )
}

export async function hashSaltCountryTbs(
  salt: bigint,
  country: string,
  tbs: Binary,
  maxTbsLength: number,
): Promise<Binary> {
  const result: bigint[] = []
  result.push(salt)
  result.push(...country.split("").map((x) => BigInt(x.charCodeAt(0))))
  result.push(...Array.from(tbs.padEnd(maxTbsLength)).map((x) => BigInt(x)))
  return Binary.from(await poseidon2HashAsync(result.map((x) => BigInt(x))))
}

export async function hashSaltCountrySignedAttrDg1PrivateNullifier(
  salt: bigint,
  country: string,
  paddedSignedAttr: Binary,
  signedAttrSize: bigint,
  dg1: Binary,
  privateNullifier: bigint,
): Promise<Binary> {
  const result: bigint[] = []
  result.push(salt)
  result.push(...country.split("").map((x) => BigInt(x.charCodeAt(0))))
  result.push(...Array.from(paddedSignedAttr).map((x) => BigInt(x)))
  result.push(signedAttrSize)
  result.push(...Array.from(dg1).map((x) => BigInt(x)))
  result.push(privateNullifier)
  return Binary.from(await poseidon2HashAsync(result.map((x) => BigInt(x))))
}

export async function hashSaltDg1PrivateNullifier(
  salt: bigint,
  dg1: Binary,
  privateNullifier: bigint,
): Promise<Binary> {
  const result: bigint[] = []
  result.push(salt)
  result.push(...Array.from(dg1).map((x) => BigInt(x)))
  result.push(privateNullifier)
  return Binary.from(await poseidon2HashAsync(result.map((x) => BigInt(x))))
}

export function getNullifierFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 1])
}

export function getParameterCommitmentFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 2])
}

export function getServiceSubScopeFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 3])
}

export function getServiceScopeFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 4])
}

export function getCommitmentInFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export async function getHostedPackagedCircuitByNameAndHash(
  name: string,
  vkeyHash: string,
): Promise<PackagedCircuit> {
  const response = await fetch(
    `https://circuits.zkpassport.id/artifacts/${name}_${vkeyHash
      .replace("0x", "")
      .substring(0, 16)}.json.gz`,
  )
  const circuit = await response.json()
  return circuit as PackagedCircuit
}

export async function getHostedPackagedCircuitByVkeyHash(
  vkeyHash: string,
): Promise<PackagedCircuit> {
  const response = await fetch(
    `https://circuits.zkpassport.id/hashes/${vkeyHash.replace("0x", "")}.json.gz`,
  )
  const circuit = await response.json()
  return circuit as PackagedCircuit
}

export async function getHostedPackagedCircuitByName(
  version: `${number}.${number}.${number}`,
  name: string,
): Promise<PackagedCircuit> {
  const response = await fetch(`https://circuits.zkpassport.id/versions/${version}/${name}.json.gz`)
  const circuit = await response.json()
  return circuit as PackagedCircuit
}

/**
 * Get the number of public inputs for a circuit.
 * @param circuitName - The name of the circuit.
 * @returns The number of public inputs.
 */
export function getNumberOfPublicInputs(circuitName: string) {
  if (circuitName.startsWith("disclose_bytes")) {
    return getDiscloseBytesProofPublicInputCount()
  } else if (circuitName.startsWith("disclose_flags")) {
    return getDiscloseFlagsProofPublicInputCount()
  } else if (circuitName.startsWith("compare_age")) {
    return getAgeProofPublicInputCount()
  } else if (
    circuitName.startsWith("compare_birthdate") ||
    circuitName.startsWith("compare_expiry")
  ) {
    return getDateProofPublicInputCount()
  } else if (circuitName.startsWith("exclusion_check")) {
    return getCountryExclusionProofPublicInputCount()
  } else if (circuitName.startsWith("inclusion_check")) {
    return getCountryInclusionProofPublicInputCount()
  } else if (circuitName.startsWith("data_check_integrity")) {
    return getIntegrityProofPublicInputCount()
  } else if (circuitName.startsWith("sig_check_id_data")) {
    return getIDDataProofPublicInputCount()
  } else if (circuitName.startsWith("sig_check_dsc")) {
    return getDSCProofPublicInputCount()
  } else if (circuitName.startsWith("outer")) {
    // Get the characters after the last underscore
    const disclosureProofCount = Number(circuitName.substring(circuitName.lastIndexOf("_") + 1)) - 3
    return 12 + disclosureProofCount
  }
  return 0
}

export function getCommittedInputCount(circuitName: DisclosureCircuitName) {
  switch (circuitName) {
    case "compare_age_evm":
      return 11
    case "compare_birthdate_evm":
      return 25
    case "compare_expiry_evm":
      return 25
    case "disclose_bytes_evm":
      return 181
    case "inclusion_check_issuing_country_evm":
      return 601
    case "inclusion_check_nationality_evm":
      return 601
    case "exclusion_check_issuing_country_evm":
      return 601
    case "exclusion_check_nationality_evm":
      return 601
    case "compare_age":
      return 11
    case "compare_birthdate":
      return 25
    case "compare_expiry":
      return 25
    case "disclose_bytes":
      return 181
    case "inclusion_check_issuing_country":
      return 201
    case "inclusion_check_nationality":
      return 201
    case "exclusion_check_issuing_country":
      return 201
    case "exclusion_check_nationality":
      return 201
    default:
      throw new Error(`Unknown circuit name: ${circuitName}`)
  }
}

export function getFormattedDate(date: Date): string {
  return format(date, "yyyyMMdd")
}

export function getDateBytes(date: Date): Binary {
  return Binary.from(new TextEncoder().encode(getFormattedDate(date)))
}

export function getCurrentDateFromCommittedInputs(
  committedInputs: DateCommittedInputs | AgeCommittedInputs,
): Date {
  return convertDateBytesToDate(committedInputs.currentDate)
}

export const DEFAULT_DATE_VALUE = new Date(Date.UTC(1111, 10, 11))

export enum ProofType {
  DISCLOSE = 0,
  AGE = 1,
  BIRTHDATE = 2,
  EXPIRY_DATE = 3,
  NATIONALITY_INCLUSION = 4,
  NATIONALITY_EXCLUSION = 5,
  ISSUING_COUNTRY_INCLUSION = 6,
  ISSUING_COUNTRY_EXCLUSION = 7,
  BIND = 8,
}

export {
  createDisclosedDataRaw,
  DisclosedData,
  formatName,
  getDisclosedBytesFromMrzAndMask,
  getDiscloseEVMParameterCommitment,
  getDiscloseParameterCommitment,
  parseDocumentType,
} from "./disclose"

export * from "./age"
export * from "./country"
export * from "./date"
export * from "./dsc"
export * from "./id-data"
export * from "./integrity"
export * from "./vkey"
export * from "./bind"
