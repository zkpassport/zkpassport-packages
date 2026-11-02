import type { CircuitManifest, ProofResult } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"

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

/** A copy of `manifest` with one more circuit and the root of its circuits, which no registry holds */
export async function withDummyCircuit(manifest: CircuitManifest): Promise<CircuitManifest> {
  const circuits = { ...manifest.circuits, dummy: { hash: `0x${"00".repeat(31)}01`, size: 1 } }
  const root = await calculateCircuitRoot({
    hashes: Object.values(circuits).map((circuit) => circuit.hash),
  })
  return { ...manifest, circuits, root }
}
