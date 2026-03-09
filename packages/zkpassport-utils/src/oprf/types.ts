export type OPRFEvaluatorOptions = {
  services?: string[]
  threshold?: number
  apiKey?: unknown
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

export type OPRFResult = {
  oprfProof: OPRFProof
  oprfOutput: bigint
  publicKey: { x: bigint; y: bigint }
}
