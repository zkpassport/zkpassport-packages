import { ProofResult } from "@/types"

/** Auth payload of the v1 `face-match` module */
export type OPRFFaceMatchAuth = {
  oprf_key_id: string
  proofs: ProofResult[]
}

/**
 * Auth payload of the v2 `register` module (step 1, identify).
 * No key id: the nodes always evaluate under the registration key k_reg.
 */
export type OPRFRegisterAuth = {
  proofs: ProofResult[]
}

/**
 * Auth payload of the v2 `nullifier` module (step 3, query).
 * Must not name the registration key.
 */
export type OPRFNullifierAuth = {
  oprf_key_id: string
  /** The registration id I, as decimal strings [x, y] (see `registrationIdToWire`) */
  I: [string, string]
  proofs: ProofResult[]
}

export type OPRFEvaluatorAuth = OPRFFaceMatchAuth | OPRFRegisterAuth | OPRFNullifierAuth

/** A BabyJubJub point, e.g. the registration id I = OPRF(pn, k_reg) */
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
