import type { Alpha2Code, Alpha3Code } from "i18n-iso-countries"
import type { SOD } from "../passport"
import type { CountryName } from "./countries"
import type { DigestAlgorithm, SignatureAlgorithm } from "../cms/types"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { packBeBytesIntoFields } from "@/utils"
export type { DigestAlgorithm, SignatureAlgorithm }

export type SavedPassport = {
  id: string
  name: string
}

export type MySettings = {
  activePassport: string
  passports: SavedPassport[]
  showResetDataButton: boolean
}

export type DataGroupInfo = {
  groupNumber: number
  name: string
  hash: number[]
  value: number[]
}

export type PassportViewModel = {
  mrz: string
  // First name (without middle names and secondary given names) and last name
  name: string
  // First name (including middle names and secondary given names) and last name
  fullName: string
  dateOfBirth: string
  nationality: string
  gender: string
  passportNumber: string
  dateOfIssue: string
  passportExpiry: string
  firstName: string
  lastName: string
  photo: string
  originalPhoto: string

  chipAuthSupported: boolean
  chipAuthSuccess: boolean
  chipAuthFailed: boolean

  LDSVersion: string

  dataGroups: DataGroupInfo[]
  dataGroupsHashAlgorithm: string

  sod: SOD
  appVersion: string
}

export type RSACertificate = {
  signatureAlgorithm?: string
  issuer?: string
  modulus?: string // Using string to represent BigUInt
  exponent?: number
}

export type SubmitProofResponse = {
  success: boolean
  message?: string
  error?: string
  code?: string
  country?: string
}

export type ScanRequestResponse = {
  success: boolean
  message?: string
  code?: string
}

export type ParameterKind = "string" | "array" | "struct" | "field" | "integer"

export type ParameterType = {
  kind: ParameterKind
  length?: number
  type?: ParameterType
  fields?: Parameter[]
}

export type Parameter = {
  name: string
  type: ParameterType
  visibility: "private" | "public"
}

export type Circuit = {
  noir_version: `${number}.${number}.${number}+${string}`
  hash: number
  abi: {
    parameters: Parameter[]
    param_witnesses: {
      [key: string]: { start: number; end: number }[]
    }
    return_type: any
    return_witnesses: any[]
    error_types: any
  }
  bytecode: string
  debug_symbols: string
  file_map: {
    [key: string]: {
      source: string
      path: string
    }
  }
  names: string[]
}

export type PackagedCircuit = {
  name: string
  noir_version: string
  bb_version: string
  size: number
  abi: {
    parameters: Parameter[]
    param_witnesses: {
      [key: string]: { start: number; end: number }[]
    }
    return_type: any
    return_witnesses: any[]
    error_types: any
  }
  bytecode: string
  vkey: string
  vkey_hash: string
  hash: number
}

export type DisclosableIDCredential =
  | "birthdate"
  | "expiry_date"
  | "nationality"
  | "firstname"
  | "lastname"
  | "fullname"
  | "document_number"
  | "document_type"
  | "issuing_country"
  | "gender"

export type NumericalIDCredential = "age" | "birthdate" | "expiry_date"

export type IDCredential = NumericalIDCredential | DisclosableIDCredential
export type IDCredentialValue<T extends IDCredential> = T extends "nationality" | "issuing_country"
  ? CountryName | Alpha3Code
  : T extends "gender"
    ? "male" | "female"
    : T extends "document_type"
      ? "passport" | "id_card" | "residence_permit" | "other"
      : T extends "age"
        ? number
        : T extends "birthdate" | "expiry_date"
          ? Date
          : string

export type IDCredentialConfig = {
  eq?: any
  gte?: number | Date
  gt?: number | Date
  lte?: number | Date
  lt?: number | Date
  range?: [number | Date, number | Date]
  in?: any[]
  out?: any[]
  disclose?: boolean
}

export type DiscloseFlags = {
  issuing_country: boolean
  nationality: boolean
  document_type: boolean
  document_number: boolean
  date_of_expiry: boolean
  date_of_birth: boolean
  gender: boolean
  name: boolean
}

export type QueryResultValue<T extends IDCredential> = {
  eq?: {
    expected: T extends "nationality" | "issuing_country"
      ? Alpha3Code
      : T extends "age"
        ? number
        : T extends "birthdate" | "expiry_date"
          ? Date
          : string
    result: boolean
  }
  gte?: {
    expected: T extends "age" ? number : Date
    result: boolean
  }
  gt?: {
    expected: T extends "age" ? number : Date
    result: boolean
  }
  lte?: {
    expected: T extends "age" ? number : Date
    result: boolean
  }
  lt?: {
    expected: T extends "age" ? number : Date
    result: boolean
  }
  range?: {
    expected: [T extends "age" ? number : Date, T extends "age" ? number : Date]
    result: boolean
  }
  in?: {
    expected: T extends "nationality" | "issuing_country" ? Alpha3Code[] : any[]
    result: boolean
  }
  out?: {
    expected: T extends "nationality" | "issuing_country" ? Alpha3Code[] : any[]
    result: boolean
  }
  disclose?: {
    result: T extends "birthdate" | "expiry_date"
      ? Date
      : T extends "age"
        ? number
        : T extends "nationality" | "issuing_country"
          ? Alpha3Code
          : string
  }
}

export type ExtendedAlpha2Code = Alpha2Code | "EU" | "UN"
// Explicit list of supported countries for sanction lists
// TODO: extend this list as more countries sanction lists are added
export type SanctionsAlpha2Code = "US" | "GB" | "CH" | "EU"
export type SanctionsCountries = SanctionsAlpha2Code[] | SanctionsAlpha2Code | "all"
export type SanctionsLists = string[] | "all"

export type SanctionsConfig = {
  countries?: SanctionsCountries
  lists?: SanctionsLists
  strict?: boolean
}

export type SanctionsResult = {
  // Indicates if all the sanction checks passed
  passed: boolean
  // Indicates if the sanction check for the country's sanction lists passed
  countries?: Record<SanctionsAlpha2Code, { passed: boolean }>
  // Indicates if the sanction check for the list passed
  lists?: Record<string, { passed: boolean }>
  // Indicates if the sanction check was done in strict mode
  isStrict: boolean
}

export type FacematchMode = "strict" | "regular"
export type FacematchConfig = {
  mode: FacematchMode
}

export type FacematchResult = {
  mode: FacematchMode
  // Indicates if the facematch check passed
  passed: boolean
}

export type Query = {
  [key in IDCredential]?: IDCredentialConfig
} & {
  bind?: BoundData
  sanctions?: SanctionsConfig
  facematch?: FacematchConfig
}

export type QueryResult = {
  [key in IDCredential]?: QueryResultValue<key>
} & {
  bind?: BoundData
  sanctions?: SanctionsResult
  facematch?: FacematchResult
}

export type AgeCommittedInputs = {
  minAge: number
  maxAge: number
}

export type CountryCommittedInputs = {
  countries: Alpha3Code[]
}

export type DateCommittedInputs = {
  minDateTimestamp: number
  maxDateTimestamp: number
}

export type DiscloseCommittedInputs = {
  discloseMask: number[]
  disclosedBytes: number[]
}

export type FacematchCommittedInputs = {
  rootKeyLeaf: string
  environment: "development" | "production"
  appIdHash: string
  integrityPubkeyHash: string
  mode: FacematchMode
}

export type SupportedChain = "ethereum" | "ethereum_sepolia" | "local"

export type BoundData = {
  user_address?: string
  chain?: SupportedChain
  custom_data?: string
}

export type BindCommittedInputs = {
  data: BoundData
}

export type SanctionsCommittedInputs = {
  rootHash: string
  isStrict: boolean
}

export type CommittedInputs =
  | AgeCommittedInputs
  | CountryCommittedInputs
  | DateCommittedInputs
  | DiscloseCommittedInputs
  | BindCommittedInputs
  | SanctionsCommittedInputs
  | FacematchCommittedInputs

export type DisclosureCircuitName =
  | "disclose_bytes"
  | "disclose_bytes_evm"
  | "compare_age"
  | "compare_age_evm"
  | "compare_birthdate"
  | "compare_birthdate_evm"
  | "compare_expiry"
  | "compare_expiry_evm"
  | "exclusion_check_issuing_country"
  | "exclusion_check_issuing_country_evm"
  | "exclusion_check_nationality"
  | "exclusion_check_nationality_evm"
  | "exclusion_check_sanctions"
  | "exclusion_check_sanctions_evm"
  | "inclusion_check_issuing_country"
  | "inclusion_check_issuing_country_evm"
  | "inclusion_check_nationality"
  | "inclusion_check_nationality_evm"
  | "bind"
  | "bind_evm"
  | "facematch"
  | "facematch_evm"

export type ProofResult = {
  proof?: string
  vkeyHash?: string
  version?: `${number}.${number}.${number}`
  name?: string
  committedInputs?: {
    [circuitName in DisclosureCircuitName]?: CommittedInputs
  }
  // Index of the proof in the proof set
  index?: number
  // Total number of proofs in the proof set
  total?: number
}

export type Service = {
  name: string
  logo: string
  purpose: string
  scope?: string
  projectID?: string
  chainId?: number
  cloudProverUrl?: string
  bridgeUrl?: string
}

export type ProofMode = "fast" | "compressed" | "compressed-evm"

export type QRCodeData = {
  query: Query | null
  topic: string | null
  pubkey: string | null
  domain: string | null
  service: Service | null
  mode: ProofMode
  sdkVersion: string | null
  timestamp: number | null
  devMode: boolean | null
}

export interface JsonRpcRequest {
  jsonrpc: string
  id: string
  origin?: string
  method: string
  params: any
}

export interface JsonRpcResponse {
  jsonrpc: string
  id: string
  result: any
}

export type PassportReaderEvent =
  | "SCAN_STARTED"
  | "PACE_STARTED"
  | "PACE_SUCCEEDED"
  | "PACE_FAILED"
  | "BAC_STARTED"
  | "BAC_SUCCEEDED"
  | "BAC_FAILED"
  | "GET_COM_STARTED"
  | "GET_COM_SUCCEEDED"
  | "GET_COM_FAILED"
  | "GET_SOD_STARTED"
  | "GET_SOD_SUCCEEDED"
  | "GET_DG1_STARTED"
  | "GET_DG1_SUCCEEDED"
  | "GET_DG2_STARTED"
  | "GET_DG2_SUCCEEDED"
  | "GET_DG5_STARTED"
  | "GET_DG5_SUCCEEDED"
  | "GET_DG5_FAILED"
  | "GET_DG7_STARTED"
  | "GET_DG7_SUCCEEDED"
  | "GET_DG7_FAILED"
  | "GET_DG11_STARTED"
  | "GET_DG11_SUCCEEDED"
  | "GET_DG11_FAILED"
  | "GET_DG12_STARTED"
  | "GET_DG12_SUCCEEDED"
  | "GET_DG12_FAILED"
  | "GET_DG13_STARTED"
  | "GET_DG13_SUCCEEDED"
  | "GET_DG13_FAILED"
  | "GET_DG14_STARTED"
  | "GET_DG14_SUCCEEDED"
  | "GET_DG14_FAILED"
  | "GET_DG15_STARTED"
  | "GET_DG15_SUCCEEDED"
  | "GET_DG15_FAILED"
  | "PREP_DATA"
  | "GET_PHOTO_STARTED"
  | "GET_PHOTO_SUCCEEDED"
  | "PASSPORT_READ_FAILED"

export type IDDataInputs = {
  e_content: number[]
  signed_attributes: number[]
  dg1: number[]
  dg2_hash_normalized: bigint
  dg2_hash_type: number
}

export type ECDSADSCDataInputs = {
  tbs_certificate: number[]
  dsc_pubkey_x: number[]
  dsc_pubkey_y: number[]
}

export type RSADSCDataInputs = {
  tbs_certificate: number[]
  dsc_pubkey: number[]
  exponent: number
  dsc_pubkey_redc_param: number[]
}

export type ECDSACSCPublicKey = {
  type: "ecPublicKey"
  curve: string
  public_key_x: string
  public_key_y: string
}

export type RSACSCPublicKey = {
  type: "rsaEncryption"
  modulus: string
  exponent: number
  scheme: "pkcs" | "pss"
  hash_algorithm?: DigestAlgorithm
}

export type Certificate = {
  signature_algorithm: SignatureAlgorithm
  public_key: RSACSCPublicKey | ECDSACSCPublicKey
  country: Alpha3Code
  validity: {
    not_before: number
    not_after: number
  }
  key_size: number
  authority_key_identifier?: string
  subject_key_identifier?: string
  private_key_usage_period?: {
    not_before?: number
    not_after?: number
  }
}

export type Letter =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z"

export type TwoLetterCode = `${Letter}${Letter}`

export enum NullifierType {
  NON_SALTED = 0,
  SALTED = 1,
  NON_SALTED_MOCK = 2,
  SALTED_MOCK = 3,
}

export class SaltedValue<T extends number | string | bigint | Array<number>> {
  constructor(
    public value: T,
    public salt: bigint,
    public hash: bigint,
  ) {
    this.value = value
    this.salt = salt
    this.hash = hash
  }

  static fromValue<T extends number | string | bigint | Array<number>>(
    salt: bigint,
    value: T,
  ): SaltedValue<T> {
    return new SaltedValue(value, salt, BigInt(0))
  }

  static fromHash<T extends number | string | bigint | Array<number>>(
    hash: bigint,
    defaultValue: T,
  ): SaltedValue<T> {
    return new SaltedValue(defaultValue, BigInt(0), hash)
  }

  async getHash(): Promise<bigint> {
    if (this.hash !== BigInt(0)) {
      return this.hash
    }
    if (Array.isArray(this.value)) {
      const packedValue = packBeBytesIntoFields(new Uint8Array(this.value), 31).map((x) =>
        BigInt(x),
      )
      return await poseidon2HashAsync([this.salt, ...packedValue])
    } else {
      return await poseidon2HashAsync([this.salt, BigInt(this.value)])
    }
  }

  formatForInput(): {
    value: string | number[]
    salt: string
    hash: string
  } {
    return {
      value: Array.isArray(this.value) ? this.value : `0x${BigInt(this.value).toString(16)}`,
      salt: `0x${this.salt.toString(16)}`,
      hash: `0x${this.hash.toString(16)}`,
    }
  }
}

export type IntegrityToDisclosureSalts = {
  dg1Salt: bigint
  expiryDateSalt: bigint
  dg2HashSalt: bigint
  privateNullifierSalt: bigint
}

export type { CountryName } from "./countries"

export type {
  ECCurve,
  ECPublicKey,
  RSAPublicKey,
  HashAlgorithm,
  NISTCurveName,
  BrainpoolCurveName,
  CurveName,
  SignatureAlgorithmType,
  PackagedCertificate,
  CircuitManifest,
  CircuitManifestEntry,
} from "./registry"
