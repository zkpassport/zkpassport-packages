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

  const circuit_size = shift(vkey, 8) // uint64
  fields.push(toField(circuit_size.bytes))

  const num_public_inputs = shift(vkey, 8) // uint64, skipped

  const pub_inputs_offset = shift(vkey, 8) //  uint64
  fields.push(toField(pub_inputs_offset.bytes))

  const contains_ipa_claim = shift(vkey, 8) // bool
  fields.push(toField(contains_ipa_claim.bytes))

  // Contains aggregation object (aka contains_pairing_point_accumulator)
  const contains_aggregation_object = vkey.bytes.slice(0, 1) // bool

  // Aggregation object (aka pairing_point_accumulator_indices)
  // See: https://github.com/aztecprotocol/aztec-packages/blob/c53f4cf84c60b8d81cc62d5827ec4408da88cc4e/barretenberg/cpp/src/barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp#L10
  // If the contains_aggregation_object flag is 0x00 or 0x01, then the aggregation object is present
  if (contains_aggregation_object[0] === 0 || contains_aggregation_object[0] === 1) {
    // Add the contains_aggregation_object flag byte
    shift(vkey, 1)
    fields.push(toField(contains_aggregation_object))
    // The next 64 bytes contain the aggregation object
    // Add each 4 byte chunk over 16 fields
    for (let offset = 0; offset < 64; offset += 4) {
      const aggregation_object_chunk = shift(vkey, 4)
      fields.push(toField(aggregation_object_chunk.bytes))
    }
  }
  // No aggregation object (only applies to EVM vkeys?)
  else {
    // Push 17 empty fields
    for (let i = 0; i < 17; i++) fields.push("0x" + "0".repeat(64))
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
