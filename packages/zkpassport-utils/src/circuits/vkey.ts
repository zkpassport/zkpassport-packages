/*function shift(arr: { bytes: Uint8Array }, n: number): { bytes: Uint8Array } {
  const removed = arr.bytes.slice(0, n)
  arr.bytes = arr.bytes.slice(n)
  return { bytes: removed }
}*/

function toField(buf: Uint8Array) {
  return "0x" + Buffer.from(buf).toString("hex").padStart(64, "0")
}

// Deserialises a serialised UltraHonk verification key into an array of field elements
// See the C++ Barretenberg function to_field_elements() for UltraVerificationKey
export function ultraVkToFields(bytes: Uint8Array): string[] {
  const fields: string[] = []
  // Split the bytes into 32-byte chunks (each represents a field element)
  for (let offset = 0; offset < bytes.length; offset += 32) {
    fields.push(toField(bytes.slice(offset, offset + 32)))
  }
  return fields
}

/**
 * Get the number of public inputs from a vkey.
 * @param vkey - The vkey to get the number of public inputs from.
 * @returns The number of public inputs.
 */
export function getNumberOfPublicInputsFromVkey(vkey: Uint8Array): number {
  const num_public_inputs = toField(vkey.slice(32, 64))
  return parseInt(num_public_inputs, 16) - 16
}
