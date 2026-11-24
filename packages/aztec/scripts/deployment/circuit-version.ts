/**
 * Circuit-manifest version id, as the registry expects it.
 *
 * Convention (mirrors the ZKPassport SDK's L1 `params.version` encoding): the
 * CircuitManifest.version semver is packed as three 2-byte big-endian fields
 * (major, minor, patch) left-aligned in a bytes32, read as a Field. Example:
 * "0.20.0" -> 0x0000001400…00. Proof capsules end with the same encoding of the
 * release that made the proof, which the registry checks its vks against; apps set
 * the oldest release they accept with ServiceConfig.min_version.
 */
import { Fr } from "@aztec-labs/aztec.js/fields"

export function packCircuitManifestVersion(semver: string): Fr {
  const parts = semver.split(".").map(Number)
  if (parts.length !== 3 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 0xffff)) {
    throw new Error(`invalid circuit manifest version: ${semver}`)
  }
  const [major, minor, patch] = parts
  return new Fr((BigInt(major) << 240n) | (BigInt(minor) << 224n) | (BigInt(patch) << 208n))
}
