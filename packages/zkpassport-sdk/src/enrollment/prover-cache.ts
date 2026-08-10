import type { CircuitManifest, PackagedCircuit } from "@zkpassport/utils"
import { RegistryClient } from "@zkpassport/registry"
import { clearStaleCrsCacheOnVersionChange } from "../bb-verifier"

/**
 * Module-level caches for everything browser proving needs that does NOT require
 * the user's passkey: the noir/bb.js modules (multi-MB WASM), a live Barretenberg
 * instance, the CRS points, circuit manifests, packaged circuits (bytecode+vkey)
 * and registry root validity checks.
 *
 * Warming these while the user is still looking at the intro screen removes most
 * of the latency between clicking a saved ID and the proof starting.
 */

type ProvingModules = {
  Noir: typeof import("@noir-lang/noir_js").Noir
  UltraHonkBackend: typeof import("@aztec/bb.js").UltraHonkBackend
  Barretenberg: typeof import("@aztec/bb.js").Barretenberg
  Crs: typeof import("@aztec/bb.js").Crs
}

type BarretenbergInstance = Awaited<
  ReturnType<(typeof import("@aztec/bb.js"))["Barretenberg"]["new"]>
>

const ROOT_VALIDITY_TTL_MS = 10 * 60 * 1000

let modulesPromise: Promise<ProvingModules> | null = null
let barretenbergPromise: Promise<BarretenbergInstance> | null = null
const manifestCache = new Map<string, Promise<CircuitManifest>>()
const circuitCache = new Map<string, Promise<PackagedCircuit>>()
const rootValidityCache = new Map<string, { at: number; value: Promise<boolean> }>()
const crsCache = new Map<number, Promise<void>>()

/** Number of proving threads for this page (multithreaded only when isolated). */
export function getProvingThreads(): number {
  const isolated = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated
  if (!isolated) return 1
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 1) : 1
  return Math.max(1, Math.min(cores, 8))
}

/** Dynamically import the proving stack once (noir_js + bb.js, both heavy). */
export function getProvingModules(): Promise<ProvingModules> {
  if (!modulesPromise) {
    modulesPromise = Promise.all([import("@noir-lang/noir_js"), import("@aztec/bb.js")]).then(
      ([noir, bb]) => ({
        Noir: noir.Noir,
        UltraHonkBackend: bb.UltraHonkBackend,
        Barretenberg: bb.Barretenberg,
        Crs: bb.Crs,
      }),
    )
    modulesPromise.catch(() => {
      modulesPromise = null
    })
  }
  return modulesPromise
}

/** Shared Barretenberg instance for local proving; kept alive between proofs. */
export function getSharedBarretenberg(): Promise<BarretenbergInstance> {
  if (!barretenbergPromise) {
    barretenbergPromise = (async () => {
      await clearStaleCrsCacheOnVersionChange("v5")
      const { Barretenberg } = await getProvingModules()
      const threads = getProvingThreads()
      if (threads > 1) {
        console.log(`ZKPassport: proving with ${threads} threads (crossOriginIsolated)`)
      }
      return Barretenberg.new({ threads })
    })()
    barretenbergPromise.catch(() => {
      barretenbergPromise = null
    })
  }
  return barretenbergPromise
}

/** The shared instance if one is already live/starting (never creates one). */
export function peekSharedBarretenberg(): Promise<BarretenbergInstance> | null {
  return barretenbergPromise
}

function chainIdFor(devMode: boolean): number {
  return devMode ? 11155111 : 1
}

export function getManifestCached(version: string, devMode: boolean): Promise<CircuitManifest> {
  const key = `${chainIdFor(devMode)}:${version}`
  let cached = manifestCache.get(key)
  if (!cached) {
    const registryClient = new RegistryClient({ chainId: chainIdFor(devMode) })
    cached = registryClient.getCircuitManifest(undefined, { version })
    cached.catch(() => manifestCache.delete(key))
    manifestCache.set(key, cached)
  }
  return cached
}

export function getPackagedCircuitCached(
  name: string,
  manifest: CircuitManifest,
  devMode: boolean,
  options?: { validate?: boolean },
): Promise<PackagedCircuit> {
  const key = `${chainIdFor(devMode)}:${manifest.version}:${name}:${options?.validate !== false}`
  let cached = circuitCache.get(key)
  if (!cached) {
    const registryClient = new RegistryClient({ chainId: chainIdFor(devMode) })
    cached = registryClient.getPackagedCircuit(name, manifest, options)
    cached.catch(() => circuitCache.delete(key))
    circuitCache.set(key, cached)
  }
  return cached
}

function getRootValidityCached(
  kind: "circuit" | "certificate",
  root: string,
  devMode: boolean,
): Promise<boolean> {
  const key = `${kind}:${chainIdFor(devMode)}:${root}`
  const cached = rootValidityCache.get(key)
  if (cached && Date.now() - cached.at < ROOT_VALIDITY_TTL_MS) {
    return cached.value
  }
  const registryClient = new RegistryClient({ chainId: chainIdFor(devMode) })
  const value =
    kind === "circuit"
      ? registryClient.isCircuitRootValid(root)
      : registryClient.isCertificateRootValid(root)
  value.catch(() => rootValidityCache.delete(key))
  rootValidityCache.set(key, { at: Date.now(), value })
  return value
}

export function isCircuitRootValidCached(root: string, devMode: boolean): Promise<boolean> {
  return getRootValidityCached("circuit", root, devMode)
}

export function isCertificateRootValidCached(root: string, devMode: boolean): Promise<boolean> {
  return getRootValidityCached("certificate", root, devMode)
}

/** Download (and IndexedDB-cache) the CRS points needed for the given circuit size. */
export function prefetchCrs(circuitSize: number): Promise<void> {
  // UltraHonk works over the next power-of-two subgroup; +1 for the shifted point
  const points = 2 ** Math.ceil(Math.log2(Math.max(circuitSize, 2))) + 1
  let cached = crsCache.get(points)
  if (!cached) {
    cached = (async () => {
      const { Crs } = await getProvingModules()
      await Crs.new(points)
    })()
    cached.catch(() => crsCache.delete(points))
    crsCache.set(points, cached)
  }
  return cached
}

/**
 * Fire-and-forget warm-up of everything local verification will need for the
 * given circuits. Failures are swallowed: warm-up must never break anything,
 * the real run re-attempts whatever is missing.
 */
export function warmupLocalProving({
  circuitNames,
  circuitVersions,
  certificateRoots,
  devMode,
}: {
  circuitNames: string[]
  circuitVersions: string[]
  certificateRoots: string[]
  devMode: boolean
}): void {
  const swallow = (promise: Promise<unknown>) => promise.catch(() => {})

  swallow(getSharedBarretenberg())

  for (const version of new Set(circuitVersions)) {
    const manifestPromise = getManifestCached(version, devMode)
    swallow(
      manifestPromise.then((manifest) => {
        swallow(isCircuitRootValidCached(manifest.root, devMode))
        let maxSize = 0
        for (const name of circuitNames) {
          const entry = manifest.circuits[name]
          if (!entry) continue
          maxSize = Math.max(maxSize, entry.size ?? 0)
          swallow(getPackagedCircuitCached(name, manifest, devMode))
        }
        if (maxSize > 0) {
          swallow(prefetchCrs(maxSize))
        }
      }),
    )
  }

  for (const root of new Set(certificateRoots)) {
    swallow(isCertificateRootValidCached(root, devMode))
  }
}
