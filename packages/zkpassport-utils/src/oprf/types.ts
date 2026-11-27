import { ProofResult } from "@/types"

/** v1 `face-match` module */
export type OPRFFaceMatchAuth = {
  oprf_key_id: string
  proofs: ProofResult[]
}

/** v2 `register` module: always evaluated under the registration key, so no key id */
export type OPRFRegisterAuth = {
  proofs: ProofResult[]
}

/** v2 `nullifier` module */
export type OPRFNullifierAuth = {
  oprf_key_id: string
  /** registration id, decimal strings [x, y] */
  I: [string, string]
  proofs: ProofResult[]
}

export type OPRFEvaluatorAuth = OPRFFaceMatchAuth | OPRFRegisterAuth | OPRFNullifierAuth

export type BabyJubJubPoint = {
  x: bigint
  y: bigint
}

export type OPRFEvaluatorOptions = {
  services?: string[]
  threshold?: number
  moduleName?: string
  protocolVersion?: string
  domainSeparator?: bigint
  mock?: boolean | { secretKey: bigint }
}

export type OPRFProof = {
  pk: { x: string; y: string }
  dlog_e: string
  dlog_s: string
  response_blinded: { x: string; y: string }
  response: { x: string; y: string }
  beta: string
}

export type OPRFPublicKey = {
  x: bigint
  y: bigint
}

export type OPRFResult = {
  oprfProof: OPRFProof
  oprfOutput: bigint
  publicKey: OPRFPublicKey
}
