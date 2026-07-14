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
  await resetBrowserCrsCacheOnVersionChange(bbVersion)
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

const BB_CRS_VERSION_KEY = "zkpassport_bb_crs_version"
const BB_IDB_NAME = "keyval-store"
const BB_IDB_STORE = "keyval"
const BB_CRS_IDB_KEYS = ["g1Data", "g2Data", "grumpkinG1Data"]

async function resetBrowserCrsCacheOnVersionChange(bbVersion: BBVersion): Promise<void> {
  if (typeof indexedDB === "undefined") return
  try {
    const store = typeof localStorage !== "undefined" ? localStorage : undefined
    if (store?.getItem(BB_CRS_VERSION_KEY) === bbVersion) return
    await deleteIdbKeys(BB_IDB_NAME, BB_IDB_STORE, BB_CRS_IDB_KEYS)
    store?.setItem(BB_CRS_VERSION_KEY, bbVersion)
  } catch {
    // Best-effort cache reset; ignore failures.
  }
}

function deleteIdbKeys(dbName: string, storeName: string, keys: string[]): Promise<void> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(dbName)
      open.onupgradeneeded = () => {}
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains(storeName)) {
          db.close()
          resolve()
          return
        }
        const tx = db.transaction(storeName, "readwrite")
        const store = tx.objectStore(storeName)
        for (const key of keys) store.delete(key)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          resolve()
        }
        tx.onabort = () => {
          db.close()
          resolve()
        }
      }
      open.onerror = () => resolve()
      open.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}
