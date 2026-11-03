import { keccak_256 } from "@noble/hashes/sha3.js"
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js"

/** A wasm file bb.js loads: Node always loads the threaded one, browsers when shared memory is available */
export type BBWasmFile = "barretenberg.wasm" | "barretenberg-threads.wasm"

/**
 * The Root Registry config key that holds the sha256 of a bb version's wasm file: keccak256 of
 * "ZKPASSPORT::BB_WASM_SHA256::<bbVersion>::<file>"
 */
export function getBBWasmHashConfigKey(bbVersion: string, file: BBWasmFile): string {
  const preimage = `ZKPASSPORT::BB_WASM_SHA256::${bbVersion}::${file}`
  return `0x${bytesToHex(keccak_256(utf8ToBytes(preimage)))}`
}
