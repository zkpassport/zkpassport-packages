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

/** Thrown for proofs from circuits older than 0.20.0, which needed bb v4. */
export class UnsupportedBBVersionError extends Error {
  constructor() {
    super(
      "This proof was generated with a pre-0.20.0 circuit (bb v4), which is no longer " +
        "supported. All supported mobile app versions generate v5 proofs; to verify " +
        "old stored proofs, use @zkpassport/sdk 0.17.x.",
    )
    this.name = "UnsupportedBBVersionError"
  }
}

export async function createUltraHonkVerifier(
  bbVersion: BBVersion,
  { writingDirectory }: { writingDirectory?: string } = {},
): Promise<LoadedVerifier> {
  if (bbVersion === "v4") {
    throw new UnsupportedBBVersionError()
  }
  await clearStaleCrsCacheOnVersionChange(bbVersion)
  const crsPath = writingDirectory ? writingDirectory + "/.bb-crs" : undefined
  const { UltraHonkVerifierBackend, Barretenberg } = await import("@aztec/bb.js")
  const barretenberg = await Barretenberg.new({ crsPath })
  const verifier = new UltraHonkVerifierBackend(barretenberg)
  return { verifier, destroy: () => barretenberg.destroy() }
}

const BB_VERSION_KEY = "__zkpassport_bb_version"
const BB_CRS_DB_NAME = "keyval-store"

// Clear bb cache on v4 -> v5 due to default CRS size change
export async function clearStaleCrsCacheOnVersionChange(bbVersion: BBVersion): Promise<void> {
  if (typeof indexedDB === "undefined") return
  try {
    const store = typeof localStorage !== "undefined" ? localStorage : undefined
    if ((store?.getItem(BB_VERSION_KEY) ?? "v4") === bbVersion) return

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
    store?.setItem(BB_VERSION_KEY, bbVersion)
  } catch {
    // Best-effort cache reset; if it fails, bb.js will surface its own error.
  }
}
