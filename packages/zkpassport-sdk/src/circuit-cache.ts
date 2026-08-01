import type { CircuitManifest, PackagedCircuit } from "@zkpassport/utils"
import { RegistryClient } from "@zkpassport/registry"

/**
 * Module-level caches for the registry artifacts proof verification needs:
 * circuit manifests and packaged circuits (bytecode+vkey). Verifying several
 * proofs from one request re-uses a single fetch per artifact.
 */

const manifestCache = new Map<string, Promise<CircuitManifest>>()
const circuitCache = new Map<string, Promise<PackagedCircuit>>()

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
