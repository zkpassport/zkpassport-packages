import { ultraVkToFields } from "@zkpassport/utils"

import { VK_FIELDS } from "./constants.ts"

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Fetch the 115-field outer vk for a proof from zkPassport's live circuit host:
 * `circuits2.zkpassport.id/<net>/by-hash/<0xhash>.json` (open CORS; the same
 * source `@zkpassport/registry`'s RegistryClient reads). Needed by the
 * recursive `mode: "compressed"` flow — the capsule carries the full vk so the
 * proof can be verified in-circuit.
 *
 * Why not the SDK's `getHostedPackagedCircuitByVkeyHash`: `@zkpassport/utils`
 * still points it at the deprecated `circuits.zkpassport.id/hashes/…` host,
 * which 404s (and the util JSON.parses the HTML body into a cryptic
 * `SyntaxError: Unexpected token '<'`). Collapse back to the one-line util call
 * once it targets circuits2.
 */
export async function fetchOuterVk(vkeyHash: string): Promise<string[]> {
  const h = vkeyHash.startsWith("0x") ? vkeyHash : `0x${vkeyHash}`
  for (const net of ["testnet", "mainnet"]) {
    const res = await fetch(`https://circuits2.zkpassport.id/${net}/by-hash/${h}.json`)
    if (res.ok) {
      const pkg = (await res.json()) as { vkey: string }
      const fields = ultraVkToFields(base64ToBytes(pkg.vkey))
      if (fields.length !== VK_FIELDS) {
        throw new Error(`outer vk ${h} has ${fields.length} fields, expected ${VK_FIELDS}`)
      }
      return fields
    }
  }
  throw new Error(`zkPassport outer vk ${h} not found on circuits2.zkpassport.id`)
}
