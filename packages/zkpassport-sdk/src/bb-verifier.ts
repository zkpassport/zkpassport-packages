export type BBVersion = "v4" | "v5"

const V5_MIN_CIRCUIT_VERSION = [0, 20, 0] as const

export function getBBVersionForCircuitVersion(circuitVersion?: string): BBVersion {
  if (!circuitVersion) return "v5"
  const parts = circuitVersion.split(".").map((x) => Number(x))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "v5"
  const [maj, min, patch] = parts
  const [vMaj, vMin, vPatch] = V5_MIN_CIRCUIT_VERSION
  if (maj !== vMaj) return maj > vMaj ? "v5" : "v4"
  if (min !== vMin) return min > vMin ? "v5" : "v4"
  return patch >= vPatch ? "v5" : "v4"
}

export interface UltraHonkVerifier {
  verifyProof(proofData: {
    proof: Uint8Array
    publicInputs: string[]
    verificationKey: Uint8Array
  }): Promise<boolean>
}

export interface LoadedVerifier {
  verifier: UltraHonkVerifier
  destroy: () => Promise<void>
}

export async function createUltraHonkVerifier(
  bbVersion: BBVersion,
  { writingDirectory }: { writingDirectory?: string } = {},
): Promise<LoadedVerifier> {
  const crsPath = writingDirectory ? writingDirectory + "/.bb-crs" : undefined
  if (bbVersion === "v4") {
    const { UltraHonkVerifierBackend, Barretenberg } = await import("@aztec/bb.js-v4")
    const barretenberg = await Barretenberg.new({ crsPath })
    const verifier = new UltraHonkVerifierBackend(barretenberg)
    return { verifier, destroy: () => barretenberg.destroy() }
  }
  const { UltraHonkVerifierBackend, Barretenberg } = await import("@aztec/bb.js")
  const barretenberg = await Barretenberg.new({ crsPath })
  const verifier = new UltraHonkVerifierBackend(barretenberg)
  return { verifier, destroy: () => barretenberg.destroy() }
}
