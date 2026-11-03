import type { RegistryClient } from "@zkpassport/registry"
import {
  getNumberOfPublicInputs,
  getProofData,
  type PackagedCircuit,
  type ProofResult,
} from "@zkpassport/utils"
import { Buffer } from "buffer/"
import { loadBBWasm } from "./bb-wasm"

const BUNDLED_BB_VERSION = "6.0.0"
// The smallest CRS bb.js's wasm backend accepts, enough for every circuit's proofs
const WASM_SRS_SIZE = 131072

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

/**
 * Start bb.js for a bb version: the bundled bb, or for any other version bb.js's wasm backend with
 * that version's wasm, downloaded and checked against the Root Registry. Undefined, after logging
 * why, when that wasm cannot be used.
 */
export async function createUltraHonkVerifier(
  bbVersion: string,
  {
    registryClient,
    writingDirectory,
  }: { registryClient: RegistryClient; writingDirectory?: string },
): Promise<LoadedVerifier | undefined> {
  await clearStaleCrsCacheOnVersionChange()
  const crsPath = writingDirectory ? writingDirectory + "/.bb-crs" : undefined
  const { BackendType, Barretenberg, UltraHonkVerifierBackend } =
    await import("@aztec-foundation/bb.js")

  if (bbVersion === BUNDLED_BB_VERSION) {
    const barretenberg = await Barretenberg.new({ crsPath })
    const verifier = new UltraHonkVerifierBackend(barretenberg)
    return { verifier, destroy: () => barretenberg.destroy() }
  }

  try {
    const wasmPath = await loadBBWasm(bbVersion, registryClient, writingDirectory)
    if (!wasmPath) {
      return undefined
    }

    const barretenberg = await Barretenberg.new({
      backend: typeof window === "undefined" ? BackendType.Wasm : BackendType.WasmWorker,
      wasmPath,
      srsSize: WASM_SRS_SIZE,
      crsPath,
    })
    const verifier = new UltraHonkVerifierBackend(barretenberg)
    return { verifier, destroy: () => barretenberg.destroy() }
  } catch (error) {
    console.warn(`Error starting bb ${bbVersion} from its wasm`, error)
    return undefined
  }
}

export class BBVerifier {
  private readonly registryClient: RegistryClient
  private readonly writingDirectory: string | undefined
  private loadedVerifier: LoadedVerifier | undefined

  constructor({
    registryClient,
    writingDirectory,
  }: {
    registryClient: RegistryClient
    writingDirectory?: string
  }) {
    this.registryClient = registryClient
    this.writingDirectory = writingDirectory
  }

  /** Verify a proof with bb.js, starting the bb it needs on first use */
  async verify(proof: ProofResult, circuit: PackagedCircuit): Promise<boolean> {
    const proofData = getProofData(proof.proof as string, getNumberOfPublicInputs(proof.name!))
    this.loadedVerifier ??= await createUltraHonkVerifier(circuit.bb_version, {
      registryClient: this.registryClient,
      writingDirectory: this.writingDirectory,
    })
    if (!this.loadedVerifier) {
      console.warn(`Error verifying proof ${proof.name}: no verifier for bb ${circuit.bb_version}`)
      return false
    }

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
