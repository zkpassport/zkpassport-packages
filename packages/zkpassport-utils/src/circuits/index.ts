import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { format } from "date-fns"
import { getIDDataProofPublicInputCount, packBeBytesIntoFields, packLeBytesIntoFields } from ".."
import { Binary } from "../binary"
import { DisclosureCircuitName, NullifierType, PackagedCircuit, SaltedValue } from "../types"
import { getDSCProofPublicInputCount } from "./dsc"
import { getIntegrityProofPublicInputCount } from "./integrity"

export interface ProofData {
  publicInputs: string[]
  proof: string[]
}

export async function calculatePrivateNullifier(
  dg1: Binary,
  eContent: Binary,
  sodSig: Binary,
): Promise<Binary> {
  return Binary.from(
    await poseidon2HashAsync([
      ...packBeBytesIntoFields(dg1.toUInt8Array(), 31).map((x) => BigInt(x)),
      ...packBeBytesIntoFields(eContent.toUInt8Array(), 31).map((x) => BigInt(x)),
      ...packBeBytesIntoFields(sodSig.toUInt8Array(), 31).map((x) => BigInt(x)),
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
  result.push(
    ...packBeBytesIntoFields(new Uint8Array(country.split("").map((x) => x.charCodeAt(0))), 31).map(
      (x) => BigInt(x),
    ),
  )
  result.push(
    ...packBeBytesIntoFields(tbs.padEnd(maxTbsLength).toUInt8Array(), 31).map((x) => BigInt(x)),
  )
  return Binary.from(await poseidon2HashAsync(result.map((x) => BigInt(x))))
}

export async function hashSaltCountrySignedAttrDg1EContentPrivateNullifier(
  salt: bigint,
  country: string,
  paddedSignedAttr: Binary,
  signedAttrSize: bigint,
  dg1: Binary,
  eContent: Binary,
  privateNullifier: bigint,
): Promise<Binary> {
  const result: bigint[] = []
  result.push(salt)
  result.push(
    ...packBeBytesIntoFields(new Uint8Array(country.split("").map((x) => x.charCodeAt(0))), 31).map(
      (x) => BigInt(x),
    ),
  )
  result.push(...packBeBytesIntoFields(paddedSignedAttr.toUInt8Array(), 31).map((x) => BigInt(x)))
  result.push(signedAttrSize)
  result.push(...packBeBytesIntoFields(dg1.toUInt8Array(), 31).map((x) => BigInt(x)))
  result.push(...packBeBytesIntoFields(eContent.toUInt8Array(), 31).map((x) => BigInt(x)))
  result.push(privateNullifier)
  return Binary.from(await poseidon2HashAsync(result.map((x) => BigInt(x))))
}

export async function normalizeDg2Hash(dg2Hash: number[]): Promise<bigint> {
  return packLeBytesAndHashPoseidon2(new Uint8Array(dg2Hash))
}

export async function packLeBytesAndHashPoseidon2(input: Uint8Array): Promise<bigint> {
  const packedInput = packLeBytesIntoFields(input, 31)
  return poseidon2HashAsync(packedInput.map((x) => BigInt(x)))
}

export async function hashSaltDg1Dg2HashPrivateNullifier(
  salts: {
    dg1Salt: bigint
    expiryDateSalt: bigint
    dg2HashSalt: bigint
    privateNullifierSalt: bigint
  },
  dg1: Binary,
  expiryDate: string,
  dg2HashNormalized: bigint,
  dg2HashType: number,
  privateNullifier: bigint,
): Promise<Binary> {
  const result: bigint[] = []
  result.push(await SaltedValue.fromValue(salts.dg1Salt, dg1.toNumberArray()).getHash())
  result.push(
    await SaltedValue.fromValue(
      salts.expiryDateSalt,
      expiryDate.split("").map((char) => char.charCodeAt(0)),
    ).getHash(),
  )
  result.push(await SaltedValue.fromValue(salts.dg2HashSalt, dg2HashNormalized).getHash())
  result.push(await SaltedValue.fromValue(salts.dg2HashSalt, BigInt(dg2HashType)).getHash())
  result.push(await SaltedValue.fromValue(salts.privateNullifierSalt, privateNullifier).getHash())
  return Binary.from(await poseidon2HashAsync(result.map((x) => BigInt(x))))
}

export function getNullifierFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 1])
}

export function getNullifierTypeFromDisclosureProof(proofData: ProofData): NullifierType {
  const nullifierType = BigInt(proofData.publicInputs[proofData.publicInputs.length - 2])
  if (nullifierType === 0n) {
    return NullifierType.NON_SALTED
  } else if (nullifierType === 1n) {
    return NullifierType.SALTED
  } else if (nullifierType === 2n) {
    return NullifierType.NON_SALTED_MOCK
  } else if (nullifierType === 3n) {
    return NullifierType.SALTED_MOCK
  }
  throw new Error("Invalid nullifier type")
}

export function getParameterCommitmentFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 3])
}

export function getServiceSubScopeFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 4])
}

export function getServiceScopeFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[proofData.publicInputs.length - 5])
}

export function getCommitmentInFromDisclosureProof(proofData: ProofData): bigint {
  return BigInt(proofData.publicInputs[0])
}

export function getCurrentDateFromDisclosureProof(proofData: ProofData): Date {
  return new Date(Number(BigInt(proofData.publicInputs[1])) * 1000)
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
  if (circuitName.startsWith("data_check_integrity")) {
    return getIntegrityProofPublicInputCount()
  } else if (circuitName.startsWith("sig_check_id_data")) {
    return getIDDataProofPublicInputCount()
  } else if (circuitName.startsWith("sig_check_dsc")) {
    return getDSCProofPublicInputCount()
  } else if (circuitName.startsWith("outer")) {
    // Get the characters after the last underscore
    const disclosureProofCount = Number(circuitName.substring(circuitName.lastIndexOf("_") + 1)) - 3
    return 7 + disclosureProofCount
  }
  // Any other circuits are assumed to be disclosure circuits
  // which have a universal interface of 6 public inputs
  return 6
}

export function getCommittedInputCount(circuitName: DisclosureCircuitName) {
  // The hash for the parameter commitment is over single bytes for EVM circuits,
  // so the size needs to be encoded over 2 bytes to give enough room (i.e. 2^16)
  // For standard circuits, the hash is over fields, so we just need one field for the length
  const typeAndLengthSize = circuitName.endsWith("evm") ? 3 : 2
  switch (circuitName) {
    case "compare_age":
      return ProofTypeLength[ProofType.AGE].standard + typeAndLengthSize
    case "compare_age_evm":
      return ProofTypeLength[ProofType.AGE].evm + typeAndLengthSize
    case "compare_birthdate":
      return ProofTypeLength[ProofType.BIRTHDATE].standard + typeAndLengthSize
    case "compare_birthdate_evm":
      return ProofTypeLength[ProofType.BIRTHDATE].evm + typeAndLengthSize
    case "compare_expiry":
      return ProofTypeLength[ProofType.EXPIRY_DATE].standard + typeAndLengthSize
    case "compare_expiry_evm":
      return ProofTypeLength[ProofType.EXPIRY_DATE].evm + typeAndLengthSize
    case "disclose_bytes":
      return ProofTypeLength[ProofType.DISCLOSE].standard + typeAndLengthSize
    case "disclose_bytes_evm":
      return ProofTypeLength[ProofType.DISCLOSE].evm + typeAndLengthSize
    case "inclusion_check_issuing_country":
      return ProofTypeLength[ProofType.ISSUING_COUNTRY_INCLUSION].standard + typeAndLengthSize
    case "inclusion_check_issuing_country_evm":
      return ProofTypeLength[ProofType.ISSUING_COUNTRY_INCLUSION].evm + typeAndLengthSize
    case "inclusion_check_nationality":
      return ProofTypeLength[ProofType.NATIONALITY_INCLUSION].standard + typeAndLengthSize
    case "inclusion_check_nationality_evm":
      return ProofTypeLength[ProofType.NATIONALITY_INCLUSION].evm + typeAndLengthSize
    case "exclusion_check_issuing_country":
      return ProofTypeLength[ProofType.ISSUING_COUNTRY_EXCLUSION].standard + typeAndLengthSize
    case "exclusion_check_issuing_country_evm":
      return ProofTypeLength[ProofType.ISSUING_COUNTRY_EXCLUSION].evm + typeAndLengthSize
    case "exclusion_check_nationality":
      return ProofTypeLength[ProofType.NATIONALITY_EXCLUSION].standard + typeAndLengthSize
    case "exclusion_check_nationality_evm":
      return ProofTypeLength[ProofType.NATIONALITY_EXCLUSION].evm + typeAndLengthSize
    case "bind":
      return ProofTypeLength[ProofType.BIND].standard + typeAndLengthSize
    case "bind_evm":
      return ProofTypeLength[ProofType.BIND].evm + typeAndLengthSize
    case "exclusion_check_sanctions":
      return ProofTypeLength[ProofType.SANCTIONS_EXCLUSION].standard + typeAndLengthSize
    case "exclusion_check_sanctions_evm":
      return ProofTypeLength[ProofType.SANCTIONS_EXCLUSION].evm + typeAndLengthSize
    case "facematch":
      return ProofTypeLength[ProofType.FACEMATCH].standard + typeAndLengthSize
    case "facematch_evm":
      return ProofTypeLength[ProofType.FACEMATCH].evm + typeAndLengthSize
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
  SANCTIONS_EXCLUSION = 9,
  FACEMATCH = 10,
}

export const ProofTypeLength = {
  [ProofType.DISCLOSE]: { evm: 180, standard: 4 },
  [ProofType.AGE]: { evm: 2, standard: 2 },
  [ProofType.BIRTHDATE]: { evm: 16, standard: 2 },
  [ProofType.EXPIRY_DATE]: { evm: 16, standard: 2 },
  [ProofType.NATIONALITY_INCLUSION]: { evm: 600, standard: 200 },
  [ProofType.NATIONALITY_EXCLUSION]: { evm: 600, standard: 200 },
  [ProofType.ISSUING_COUNTRY_INCLUSION]: { evm: 600, standard: 200 },
  [ProofType.ISSUING_COUNTRY_EXCLUSION]: { evm: 600, standard: 200 },
  [ProofType.BIND]: { evm: 509, standard: 17 },
  [ProofType.SANCTIONS_EXCLUSION]: { evm: 33, standard: 2 },
  [ProofType.FACEMATCH]: { evm: 98, standard: 5 },
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
export * from "./facematch"
