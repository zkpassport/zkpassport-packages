import { ProofResult } from "@/types"

export type OPRFEvaluatorAuth = {
  oprf_key_id: string
  proofs: ProofResult[]
}

export type OPRFEvaluatorOptions = {
  services?: string[]
  threshold?: number
  moduleName?: string
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
