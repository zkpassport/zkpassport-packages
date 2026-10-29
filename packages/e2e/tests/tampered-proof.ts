import type { ProofResult } from "@zkpassport/utils"

/** A copy of `proof` with one byte of its proof body flipped */
export function withFlippedProofByte(proof: ProofResult): ProofResult {
  const proofHex = proof.proof as string
  const offsetInProofBody = proofHex.length - 200
  const flippedByte = (
    (parseInt(proofHex.slice(offsetInProofBody, offsetInProofBody + 2), 16) ^ 0xff) &
    0xff
  )
    .toString(16)
    .padStart(2, "0")

  return {
    ...proof,
    proof:
      proofHex.slice(0, offsetInProofBody) + flippedByte + proofHex.slice(offsetInProofBody + 2),
  }
}
