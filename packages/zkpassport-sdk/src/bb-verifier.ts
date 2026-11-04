import {
  getNumberOfPublicInputs,
  getProofData,
  type PackagedCircuit,
  type ProofResult,
} from "@zkpassport/utils"
import { Buffer } from "buffer/"

export type BBVersion = "v5" | "v6"

const V6_MIN_CIRCUIT_VERSION = [0, 22, 0] as const

export function getBBVersionForCircuitVersion(circuitVersion?: string): BBVersion {
  if (!circuitVersion) return "v6"
  const parts = circuitVersion.split(".").map((x) => Number(x))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "v6"

  return isAtLeast(parts, V6_MIN_CIRCUIT_VERSION) ? "v6" : "v5"
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
  await clearStaleCrsCacheOnVersionChange()
  const crsPath = writingDirectory ? writingDirectory + "/.bb-crs" : undefined

  if (bbVersion === "v5") {
    const { UltraHonkVerifierBackend, Barretenberg } = await import("@aztec/bb.js")
    const barretenberg = await Barretenberg.new({ crsPath })
    const verifier = new UltraHonkVerifierBackend(barretenberg)
    return { verifier, destroy: () => barretenberg.destroy() }
  }
  const { UltraHonkVerifierBackend, Barretenberg } = await import("@aztec-foundation/bb.js")
  const barretenberg = await Barretenberg.new({ crsPath })
  const verifier = new UltraHonkVerifierBackend(barretenberg)
  return { verifier, destroy: () => barretenberg.destroy() }
}

export class BBVerifier {
  private readonly writingDirectory: string | undefined
  private loadedVerifier: LoadedVerifier | undefined

  constructor({ writingDirectory }: { writingDirectory?: string } = {}) {
    this.writingDirectory = writingDirectory
  }

  /** Verify a proof with bb.js, starting the bb it needs on first use */
  async verify(proof: ProofResult, circuit: PackagedCircuit): Promise<boolean> {
    const proofData = getProofData(proof.proof as string, getNumberOfPublicInputs(proof.name!))
    this.loadedVerifier ??= await createUltraHonkVerifier(
      getBBVersionForCircuitVersion(proof.version),
      { writingDirectory: this.writingDirectory },
    )

    try {
      return await this.loadedVerifier.verifier.verifyProof({
        proof: Buffer.from(proofData.proof.join(""), "hex"),
        publicInputs: proofData.publicInputs,
        verificationKey: new Uint8Array(Buffer.from(circuit.vkey, "base64")),
      })
    } catch (error) {
      console.warn(`Error verifying proof ${proof.name}`, error)
      return false
    }
  }

  /** Release the bb.js instance it started */
  async destroy(): Promise<void> {
    await this.loadedVerifier?.destroy()
  }
}

const BB_VERSION_KEY = "__zkpassport_bb_version"
const BB_CRS_DB_NAME = "keyval-store"
const BB_CRS_CACHE_VERSION = "v5"

// Clear bb cache on v4 -> v5 due to default CRS size change. bb.js 6 reads the bb.js 5 cache.
async function clearStaleCrsCacheOnVersionChange(): Promise<void> {
  if (typeof indexedDB === "undefined") return
  try {
    const store = typeof localStorage !== "undefined" ? localStorage : undefined
    if ((store?.getItem(BB_VERSION_KEY) ?? "v4") === BB_CRS_CACHE_VERSION) return

    let dbExists = true
    if (typeof indexedDB.databases === "function") {
      try {
        dbExists = (await indexedDB.databases()).some((db) => db.name === BB_CRS_DB_NAME)
      } catch {
        dbExists = true
      }
    }
    if (dbExists) {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase(BB_CRS_DB_NAME)
        req.onsuccess = req.onerror = req.onblocked = () => resolve()
      })
    }
    store?.setItem(BB_VERSION_KEY, BB_CRS_CACHE_VERSION)
  } catch {
    // Best-effort cache reset; if it fails, bb.js will surface its own error.
  }
}

function isAtLeast(version: number[], minimum: readonly number[]): boolean {
  for (const [index, minimumPart] of minimum.entries()) {
    if (version[index] !== minimumPart) {
      return version[index] > minimumPart
    }
  }
  return true
}
