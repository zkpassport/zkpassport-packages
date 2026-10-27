export type BBVersion = "v4" | "v5" | "v6"

const V5_MIN_CIRCUIT_VERSION = [0, 20, 0] as const
const V6_MIN_CIRCUIT_VERSION = [0, 22, 0] as const

export function getBBVersionForCircuitVersion(circuitVersion?: string): BBVersion {
  if (!circuitVersion) return "v6"
  const parts = circuitVersion.split(".").map((x) => Number(x))
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return "v6"

  if (isAtLeast(parts, V6_MIN_CIRCUIT_VERSION)) {
    return "v6"
  }
  return isAtLeast(parts, V5_MIN_CIRCUIT_VERSION) ? "v5" : "v4"
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
  await clearStaleCrsCacheOnVersionChange(bbVersion)
  let crsPath = writingDirectory ? writingDirectory + "/.bb-crs" : undefined

  if (bbVersion === "v4") {
    console.warn("Using deprecated v4 UltraHonk Verifier")
    crsPath = writingDirectory ? writingDirectory + "/.bb-crs-v4" : undefined
    const { UltraHonkVerifierBackend, Barretenberg } = await import("@aztec/bb.js-v4")
    const barretenberg = await Barretenberg.new({ crsPath })
    const verifier = new UltraHonkVerifierBackend(barretenberg)
    return { verifier, destroy: () => barretenberg.destroy() }
  }
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

const BB_VERSION_KEY = "__zkpassport_bb_version"
const BB_CRS_DB_NAME = "keyval-store"

// Clear bb cache on v4 -> v5 due to default CRS size change. v5 and v6 share one cache layout.
async function clearStaleCrsCacheOnVersionChange(bbVersion: BBVersion): Promise<void> {
  if (typeof indexedDB === "undefined") return
  const crsCacheVersion = bbVersion === "v4" ? "v4" : "v5"
  try {
    const store = typeof localStorage !== "undefined" ? localStorage : undefined
    if ((store?.getItem(BB_VERSION_KEY) ?? "v4") === crsCacheVersion) return

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
    store?.setItem(BB_VERSION_KEY, crsCacheVersion)
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
