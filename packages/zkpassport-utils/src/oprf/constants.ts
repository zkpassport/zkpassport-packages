import type { OPRFProof, OPRFPublicKey } from "./types"

// Default OPRF service configuration
// Local dev
// export const OPRF_DEFAULT_SERVICES = [
//   "http://192.168.0.175:10001",
//   "http://192.168.0.175:10002",
//   "http://192.168.0.175:10003",
// ]

// Testnet
export const OPRF_DEFAULT_SERVICES = [
  "https://eu.node0.stage.zkp.oprf.taceo.network", // H2ONodes
  "https://eu.node1.stage.zkp.oprf.taceo.network", // TACEO
  "https://eu.node2.stage.zkp.oprf.taceo.network", // AztecLabs
]

// Mainnet
// export const OPRF_DEFAULT_SERVICES = [
//   "https://eu.node0.zkp.oprf.taceo.network", // H2ONodes
//   "https://eu.node1.zkp.oprf.taceo.network", // TACEO
//   "https://eu.node2.zkp.oprf.taceo.network", // AztecLabs
// ]

// Decimal form of key ID 0xdecd0409.
export const OPRF_DEFAULT_KEY_ID = "3737977865"

export const DEFAULT_OPRF_PUB_KEY: OPRFPublicKey = {
  x: 13056695182292878774164608850421384419479423750309782722852084640746337636219n,
  y: 238964076624519400146791840066292479628276458316033254756958747474926880923n,
}

// Poseidon2 hash of [DEFAULT_OPRF_PUB_KEY.x, DEFAULT_OPRF_PUB_KEY.y]
export const DEFAULT_OPRF_PUB_KEY_HASH =
  14426908281838318323514272053666720645511190133240995046752387775430272540363n

export const OPRF_DEFAULT_THRESHOLD = 2
export const OPRF_DEFAULT_MODULE = "face-match"
export const OPRF_DEFAULT_DOMAIN_SEPARATOR = 1330664006n // matching oprf-nr library

// OPRF wire-protocol version announced to the nodes during the WebSocket handshake.
// @taceo/oprf-client defaults this to "0.8.0", but the deployed nodes require
// >=0.9.0,<0.10.0 and reject 0.8.0, so we override it explicitly.
export const OPRF_DEFAULT_PROTOCOL_VERSION = "0.9.0"

// Default zero OPRF proof for non-salted nullifier mode
export const OPRF_ZERO_PROOF: OPRFProof = {
  pk: { x: "0x0", y: "0x0" },
  dlog_e: "0x0",
  dlog_s: "0x0",
  response_blinded: { x: "0x0", y: "0x0" },
  response: { x: "0x0", y: "0x0" },
  beta: "0x0",
}
