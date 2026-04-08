import type { CircuitManifest, PackagedCircuit } from "@zkpassport/utils"

import { RegistryClient } from "@zkpassport/registry"

type UltraHonkVerifierBackend = import("@aztec/bb.js").UltraHonkVerifierBackend

const DEFAULT_VERIFIER_CACHE_KEY = "__default__"
const LATEST_VERSION_CACHE_KEY = "__latest__"
const ROOT_VALIDITY_TTL_MS = 5 * 60 * 1000
const SEPOLIA_CHAIN_ID = 11155111

const verifierCache = new Map<string, Promise<UltraHonkVerifierBackend>>()
const manifestCache = new Map<string, Promise<CircuitManifest>>()
const packagedCircuitCache = new Map<string, Promise<PackagedCircuit>>()
const rootValidityCache = new Map<string, { expiresAt: number; valid: boolean }>()

let registryClient: RegistryClient | undefined

function getRegistryClient() {
  registryClient ??= new RegistryClient({ chainId: SEPOLIA_CHAIN_ID })
  return registryClient
}

export async function getCachedVerifierBackend(
  writingDirectory?: string,
): Promise<UltraHonkVerifierBackend> {
  const crsPath = writingDirectory ? `${writingDirectory}/.bb-crs` : undefined
  const cacheKey = crsPath ?? DEFAULT_VERIFIER_CACHE_KEY

  let promise = verifierCache.get(cacheKey)
  if (!promise) {
    promise = (async () => {
      const { UltraHonkVerifierBackend } = await import("@aztec/bb.js")
      return new UltraHonkVerifierBackend({
        crsPath,
      })
    })()
    verifierCache.set(cacheKey, promise)
    promise.catch(() => verifierCache.delete(cacheKey))
  }

  return promise!
}

export async function getCachedCircuitManifest(version?: string): Promise<CircuitManifest> {
  const cacheKey = version ?? LATEST_VERSION_CACHE_KEY

  let promise = manifestCache.get(cacheKey)
  if (!promise) {
    promise = getRegistryClient().getCircuitManifest(undefined, { version })
    manifestCache.set(cacheKey, promise)
    promise.catch(() => manifestCache.delete(cacheKey))
  }

  return promise!
}

export async function getCachedPackagedCircuit(
  circuitName: string,
  manifest: CircuitManifest,
  validate: boolean,
): Promise<PackagedCircuit> {
  const cacheKey = `${manifest.root}:${circuitName}:${validate ? "validated" : "raw"}`

  let promise = packagedCircuitCache.get(cacheKey)
  if (!promise) {
    promise = getRegistryClient().getPackagedCircuit(circuitName, manifest, {
      validate,
    })
    packagedCircuitCache.set(cacheKey, promise)
    promise.catch(() => packagedCircuitCache.delete(cacheKey))
  }

  return promise!
}

export async function getCachedRootValidity(
  type: "certificate" | "circuit",
  root: string,
): Promise<boolean> {
  const cacheKey = `${type}:${root}`
  const cached = rootValidityCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.valid
  }

  const valid =
    type === "certificate"
      ? await getRegistryClient().isCertificateRootValid(root)
      : await getRegistryClient().isCircuitRootValid(root)

  rootValidityCache.set(cacheKey, {
    valid,
    expiresAt: Date.now() + ROOT_VALIDITY_TTL_MS,
  })

  return valid
}

export async function warmupVerificationResources({
  version,
  writingDirectory,
  circuitNames = [],
}: {
  version?: string
  writingDirectory?: string
  circuitNames?: string[]
} = {}): Promise<void> {
  getRegistryClient()

  const verifierPromise = getCachedVerifierBackend(writingDirectory)
  if (!version) {
    await verifierPromise
    return
  }

  const manifest = await getCachedCircuitManifest(version)
  await verifierPromise

  if (circuitNames.length === 0) {
    return
  }

  await Promise.all(
    circuitNames.map((circuitName) =>
      getCachedPackagedCircuit(circuitName, manifest, !circuitName.startsWith("outer_evm_")),
    ),
  )
}
