import type { OPRFProof } from "./types"

// Default OPRF service configuration
// TODO: Update the URLS
export const OPRF_DEFAULT_SERVICES = [
  "https://oprf.zkpassport.id",
  "https://oprf-2.zkpassport.id",
  "https://oprf-3.zkpassport.id",
]

export const OPRF_DEFAULT_KEY_ID = "1"
export const OPRF_DEFAULT_THRESHOLD = 2
export const OPRF_DEFAULT_MODULE = "face-match"
export const OPRF_DEFAULT_DOMAIN_SEPARATOR = 1330664006n // matching oprf-nr library

// Default zero OPRF proof for non-salted nullifier mode
export const OPRF_ZERO_PROOF: OPRFProof = {
  pk: { x: "0", y: "0" },
  dlog_e: "0",
  dlog_s: "0",
  response_blinded: { x: "0", y: "0" },
  response: { x: "0", y: "0" },
  beta: "0",
}
