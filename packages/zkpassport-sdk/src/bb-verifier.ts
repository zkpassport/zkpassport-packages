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
  const { UltraHonkVerifierBackend, Barretenberg } = await import("@aztec/bb.js")
  const barretenberg = await Barretenberg.new({ crsPath })
  const verifier = new UltraHonkVerifierBackend(barretenberg)
  return { verifier, destroy: () => barretenberg.destroy() }
}

const BB_VERSION_KEY = "__zkpassport_bb_version"
const BB_CRS_DB_NAME = "keyval-store"

// The v4 and v5 verifiers share bb.js's default CRS cache (IndexedDB
// "keyval-store"), but their CRS layouts differ, so a cache written by one bb
// version makes the other throw "object store not found" during initSRSChonk.
// Reset the cache whenever the active bb version doesn't match the one that last
// wrote it — INCLUDING the first run when the marker is absent (e.g. right after
// upgrading from a build that populated the cache under a different marker, or
// none at all). The previous default of "v4" for a missing marker let a stale
// cache slip through unmodified on the v4 path and crash.
async function clearStaleCrsCacheOnVersionChange(bbVersion: BBVersion): Promise<void> {
  if (typeof indexedDB === "undefined") return
  try {
    const store = typeof localStorage !== "undefined" ? localStorage : undefined
    // A missing marker means we can't confirm which bb version wrote the cache,
    // so treat it as a mismatch and reset rather than assuming "v4".
    if (store?.getItem(BB_VERSION_KEY) === bbVersion) return

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
