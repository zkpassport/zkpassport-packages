import type { VerificationResult } from "@zkpassport/sdk"
import type { CircuitManifest, ProofResult } from "@zkpassport/utils"
import { calculateCircuitRoot } from "@zkpassport/utils/registry"
import type { HeadlessApp } from "./headless-app"
import type { TestEnv } from "./test-env"

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

/**
 * verify() of the proofs `app` sent, with the circuits CDN serving their manifest plus one more
 * circuit and the root of its circuits, which no registry holds
 */
export async function verifyAgainstUnacceptedManifest(
  testEnv: TestEnv,
  app: HeadlessApp,
): Promise<VerificationResult> {
  const { proofs, result: queryResult } = app.request.result()!
  const manifest = await testEnv.registry.getCircuitManifest(undefined, {
    version: proofs[0].version,
  })

  return testEnv.verify({
    proofs,
    queryResult,
    originalQuery: app.request.query,
    circuitManifest: await withDummyCircuit(manifest),
  })
}

async function withDummyCircuit(manifest: CircuitManifest): Promise<CircuitManifest> {
  const circuits = { ...manifest.circuits, dummy: { hash: `0x${"00".repeat(31)}01`, size: 1 } }
  const root = await calculateCircuitRoot({
    hashes: Object.values(circuits).map((circuit) => circuit.hash),
  })
  return { ...manifest, circuits, root }
}
