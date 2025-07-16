function shift(arr: { bytes: Uint8Array }, n: number): { bytes: Uint8Array } {
  const removed = arr.bytes.slice(0, n)
  arr.bytes = arr.bytes.slice(n)
  return { bytes: removed }
}

function toField(buf: Uint8Array) {
  return "0x" + Buffer.from(buf).toString("hex").padStart(64, "0")
}

// Deserialises a serialised UltraHonk verification key into an array of field elements
// See the C++ Barretenberg function to_field_elements() for UltraVerificationKey
export function ultraVkToFields(bytes: Uint8Array): string[] {
  const fields: string[] = []
  const vkey = { bytes }

  // UltraHonk vkey using keccak for the random oracle
  // have 4 bytes less than ones using poseidon2
  const is_keccak = vkey.bytes.length === 1760

  const circuit_size = shift(vkey, 8) // uint64
  fields.push(toField(circuit_size.bytes))

  const _not_used = shift(vkey, 8) // uint64, skipped

  const num_public_inputs = shift(vkey, 8) //  uint64
  fields.push(toField(num_public_inputs.bytes))

  const pub_inputs_offset = shift(vkey, 8) // uint64
  fields.push(toField(pub_inputs_offset.bytes))

  // Keccak vkeys don't have this
  if (!is_keccak) {
    const pairing_inputs_public_input_key_start_idx = shift(vkey, 4) // uint32
    fields.push(toField(pairing_inputs_public_input_key_start_idx.bytes))
  }

  // Process commitment data (remaining bytes)
  // Each 32-byte commitment is split into two field elements
  const ipa_claim_commitment = vkey.bytes
  for (let offset = 0; offset < ipa_claim_commitment.length; offset += 32) {
    const commitment = ipa_claim_commitment.slice(offset, offset + 32)
    if (commitment.length === 0) break
    // First field element uses bytes 15-31 (17 bytes)
    fields.push(toField(commitment.slice(15, 32)))
    // Second field element uses bytes 0-14 (15 bytes)
    fields.push(toField(commitment.slice(0, 15)))
  }

  return fields
}

/**
 * Get the number of public inputs from a vkey.
 * @param vkey - The vkey to get the number of public inputs from.
 * @returns The number of public inputs.
 */
export function getNumberOfPublicInputsFromVkey(vkey: Uint8Array): number {
  const num_public_inputs = toField(vkey.slice(8, 16))
  return parseInt(num_public_inputs, 16)
}
