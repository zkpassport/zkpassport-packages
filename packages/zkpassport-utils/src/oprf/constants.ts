import type { OPRFProof, OPRFPublicKey } from "./types"

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

// TODO: Replace with the real OPRF public key for OPRF_DEFAULT_KEY_ID once the DKG ceremony
// has produced the global default key. The DEFAULT_OPRF_PUB_KEY_HASH below must be kept
// consistent with this value (enforced by a unit test).
export const DEFAULT_OPRF_PUB_KEY: OPRFPublicKey = {
  x: 1n,
  y: 2n,
}

// Poseidon2 hash of [DEFAULT_OPRF_PUB_KEY.x, DEFAULT_OPRF_PUB_KEY.y].
// Same hash computed by Noir circuits on the OPRF public key, and by app smart contracts
// when validating the `oprf_pk_hash` public input against this default.
export const DEFAULT_OPRF_PUB_KEY_HASH =
  1594597865669602199208529098208508950092942746041644072252494753744672355203n

// Default zero OPRF proof for non-salted nullifier mode
export const OPRF_ZERO_PROOF: OPRFProof = {
  pk: { x: "0x0", y: "0x0" },
  dlog_e: "0x0",
  dlog_s: "0x0",
  response_blinded: { x: "0x0", y: "0x0" },
  response: { x: "0x0", y: "0x0" },
  beta: "0x0",
}
