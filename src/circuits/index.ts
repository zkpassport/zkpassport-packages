import { CERTIFICATE_REGISTRY_ID, CERT_TYPE_CSC } from "../constants"
import { Binary } from "../binary"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import {
  AgeCommittedInputs,
  Certificate,
  DateCommittedInputs,
  DisclosureCircuitName,
  ECDSACSCPublicKey,
  PackagedCircuit,
  RSACSCPublicKey,
} from "../types"
import { getDiscloseFlagsProofPublicInputCount } from "./disclose"
import { getDiscloseBytesProofPublicInputCount } from "./disclose"
import { getIntegrityProofPublicInputCount } from "./integrity"
import { getAgeProofPublicInputCount } from "./age"
import { getDateProofPublicInputCount } from "./date"
import { getDSCProofPublicInputCount } from "./dsc"
import {
  convertDateBytesToDate,
  getCountryExclusionProofPublicInputCount,
  getCountryInclusionProofPublicInputCount,
  getIDDataProofPublicInputCount,
} from ".."
import { formatDate } from "date-fns"

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

export async function getCertificateLeafHash(
  cert: Certificate,
  options?: { registry_id?: number; cert_type?: number },
): Promise<string> {
  const registryId = options?.registry_id ?? CERTIFICATE_REGISTRY_ID
  const certType = options?.cert_type ?? CERT_TYPE_CSC

  let publicKey: Binary
  if (cert.public_key.type === "rsaEncryption") {
    publicKey = Binary.from((cert.public_key as RSACSCPublicKey).modulus)
  } else if (cert.public_key.type === "ecPublicKey") {
    publicKey = Binary.from((cert.public_key as ECDSACSCPublicKey).public_key_x).concat(
      Binary.from((cert.public_key as ECDSACSCPublicKey).public_key_y),
    )
  } else {
    throw new Error("Unsupported signature algorithm")
  }
  return Binary.from(
    await poseidon2HashAsync([
      BigInt(registryId),
      BigInt(certType),
      ...Array.from(cert.country).map((char: string) => BigInt(char.charCodeAt(0))),
      ...Array.from(publicKey).map((x) => BigInt(x)),
    ]),
  ).toHex()
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
    const disclosureProofCount = Number(circuitName.charAt(circuitName.length - 1)) - 3
    return 12 + disclosureProofCount
  }
  return 0
}

export function getCommittedInputCount(circuitName: DisclosureCircuitName) {
  switch (circuitName) {
    case "compare_age_evm":
      return 10
    case "compare_birthdate_evm":
      return 24
    case "disclose_bytes_evm":
      return 180
    case "inclusion_check_issuing_country_evm":
      return 600
    case "inclusion_check_nationality_evm":
      return 600
    case "exclusion_check_issuing_country_evm":
      return 600
    case "exclusion_check_nationality_evm":
      return 600
    case "compare_age":
      return 10
    case "compare_birthdate":
      return 24
    case "compare_expiry":
      return 24
    case "disclose_bytes":
      return 180
    case "inclusion_check_issuing_country":
      return 200
    case "inclusion_check_nationality":
      return 200
    case "exclusion_check_issuing_country":
      return 200
    case "exclusion_check_nationality":
      return 200
    default:
      throw new Error(`Unknown circuit name: ${circuitName}`)
  }
}

export function getFormattedDate(date: Date): string {
  return formatDate(date, "yyyyMMdd")
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

export {
  DisclosedData,
  createDisclosedDataRaw,
  formatName,
  parseDocumentType,
  getDisclosedBytesFromMrzAndMask,
  getDiscloseParameterCommitment,
  getDiscloseEVMParameterCommitment,
} from "./disclose"

export * from "./country"
export * from "./age"
export * from "./date"
export * from "./integrity"
export * from "./id-data"
export * from "./dsc"
export * from "./vkey"
