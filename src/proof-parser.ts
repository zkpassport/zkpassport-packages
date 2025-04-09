const END_OF_PUBLIC_INPUTS_BYTES =
  "0000000000000000000000000000000000000000000000042ab5d6d1986846cf"

/**
 * Convert a proof in hex format to an array of fields.
 * @param proof - The proof to convert.
 * @returns An array of fields.
 */
export function proofToFields(proof: Buffer, startIndex = 4) {
  // Start from index 4 and chunk into 32-byte segments
  const fields = []
  for (let i = startIndex; i < proof.length; i += 32) {
    // Create a new buffer for each field by copying the bytes
    const fieldBytes = new Uint8Array(32)
    const end = Math.min(i + 32, proof.length)
    for (let j = 0; j < end - i; j++) {
      fieldBytes[j] = proof[i + j]
    }
    fields.push(Buffer.from(fieldBytes))
  }
  return fields.map((field) => field.toString("hex"))
}

/**
 * Get the number of public inputs from a proof.
 * @param proofAsFields - The proof as an array of fields.
 * @returns The number of public inputs.
 */
export function getNumberOfPublicInputsFromProof(proofAsFields: string[]) {
  const endOfPublicInputsBytes = Buffer.from(END_OF_PUBLIC_INPUTS_BYTES, "hex")
  const endOfPublicInputsBytesHex = endOfPublicInputsBytes.toString("hex")
  const endOfPublicInputsIndex = proofAsFields.findIndex(
    (field) => field === endOfPublicInputsBytesHex,
  )
  return endOfPublicInputsIndex
}

/**
 * Get the public inputs from a proof.
 * @param proofAsFields - The proof as an array of fields.
 * @param publicInputsNumber - The number of public inputs.
 * @returns The public inputs.
 */
export function getPublicInputs(proofAsFields: string[], publicInputsNumber: number) {
  return proofAsFields.slice(0, publicInputsNumber)
}

/**
 * Get the proof without the public inputs.
 * @param proofAsFields - The proof as an array of fields.
 * @param publicInputsNumber - The number of public inputs.
 * @returns The proof without the public inputs.
 */
export function getProofWithoutPublicInputs(proofAsFields: string[], publicInputsNumber: number) {
  return proofAsFields.slice(publicInputsNumber)
}

/**
 * Get the proof data from a proof.
 * @param proof - The proof to get the data from.
 * @param publicInputsNumber - The number of public inputs.
 * @param proofStartIndex - The start index of the proof (i.e. how many bytes to skip at the start when parsing it)
 * @returns The proof data.
 */
export function getProofData(proof: string, publicInputsNumber: number, proofStartIndex = 4) {
  const proofAsFields = proofToFields(Buffer.from(proof, "hex"), proofStartIndex)
  const proofWithoutPublicInputs = getProofWithoutPublicInputs(proofAsFields, publicInputsNumber)
  const publicInputs = getPublicInputs(proofAsFields, publicInputsNumber)
  return {
    proof: proofWithoutPublicInputs,
    // Make sure it's prefixed with 0x
    publicInputs: publicInputs.map((input) => (input.startsWith("0x") ? input : `0x${input}`)),
  }
}
