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

  // What is this?
  const unknown = shift(vkey, 8) // uint64
  fields.push(toField(unknown.bytes))

  const num_public_inputs_plus_pairing_points = shift(vkey, 8) //  uint64
  fields.push(toField(num_public_inputs_plus_pairing_points.bytes))

  const pub_inputs_offset = shift(vkey, 8) // uint64
  fields.push(toField(pub_inputs_offset.bytes))

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
