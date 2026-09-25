import { execSync, spawn, type ChildProcess } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, join, resolve } from "node:path"
import type { RegistryNetworkOptions } from "@zkpassport/registry"

const PACKAGES_DIR = resolve(import.meta.dir, "../..")
const CONTRACTS_DIR = join(PACKAGES_DIR, "registry-contracts")
/** Committed v1 certificate registry with 549 certificates, including both ZKR CSCAs */
export const CERTIFICATES_FILE = join(
  PACKAGES_DIR,
  "zkpassport-utils/tests/fixtures/root-certs-v1.json",
)
const CACHE_DIR = resolve(import.meta.dir, "../.cache")

async function freePort(): Promise<number> {
  return new Promise((ok) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      server.close(() => ok(port))
    })
  })
}

/**
 * Copy the published circuit manifest for a version, plus the named packaged circuits, into
 * .cache/. This is the only network use; later runs read the cache.
 */
export async function mirrorCircuits({
  version,
  circuits,
  cdn = "https://circuits2.zkpassport.id/testnet",
}: {
  version: string
  circuits: string[]
  cdn?: string
}): Promise<{ version: string; root: string }> {
  const write = (path: string, body: string) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, body)
  }
  const manifestPath = join(CACHE_DIR, "by-version", version, "manifest.json")
  if (!existsSync(manifestPath)) {
    // fetch follows the CDN's 302s and undoes its gzip
    write(manifestPath, await (await fetch(`${cdn}/by-version/${version}/manifest.json`)).text())
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  for (const name of circuits) {
    const hash = manifest.circuits[name]?.hash
    if (!hash) throw new Error(`Circuit ${name} is not in the ${version} manifest`)
    const path = join(CACHE_DIR, "by-hash", `${hash}.json`)
    if (!existsSync(path)) write(path, await (await fetch(`${cdn}/by-hash/${hash}.json`)).text())
  }
  return manifest
}

export type Devnet = {
  rpcUrl: string
  /** Registry settings for the "dev" network: this anvil and this file server */
  registry: RegistryNetworkOptions
  stop: () => void
}

/**
 * Anvil on a free port with the ZKPassport registries deployed and seeded by registry-contracts'
 * script/test/*.sh (the same scripts the registry-sdk tests use), plus a static file server with
 * the layout of the registry's dev URLs.
 *
 * The scripts write registry-contracts/broadcast/<script>/31337/run-latest.json and read it back,
 * so this must not run at the same time as the registry-sdk tests.
 */
export async function startDevnet({
  certificateRoot,
  circuitRoot,
  circuitVersion,
}: {
  certificateRoot: string
  circuitRoot: string
  circuitVersion: string
}): Promise<Devnet> {
  const port = await freePort()
  const rpcUrl = `http://127.0.0.1:${port}`
  const anvil: ChildProcess = spawn("anvil", ["--port", `${port}`, "--silent"], { stdio: "ignore" })
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        })
        if (res.ok) break
      } catch {
        // anvil is not accepting connections yet
      }
      if (attempt > 100) throw new Error("anvil did not start")
      await Bun.sleep(100)
    }
    const env = { ...process.env, RPC_URL: rpcUrl }
    const deployOutput = execSync("script/test/deploy-root-registry.sh", {
      cwd: CONTRACTS_DIR,
      env,
      encoding: "utf8",
    })
    const rootRegistry = deployOutput.match(/RootRegistry deployed at: (0x[a-fA-F0-9]{40})/)?.[1]
    const registryHelper = deployOutput.match(
      /RegistryHelper deployed at: (0x[a-fA-F0-9]{40})/,
    )?.[1]
    if (!rootRegistry || !registryHelper)
      throw new Error("Could not read the deployed registry addresses")
    // Makes these the latest roots; the registries treat the latest root as valid at any date
    execSync("script/test/seed-registries.sh", {
      cwd: CONTRACTS_DIR,
      env: {
        ...env,
        CERTIFICATE_REGISTRY_ROOT: certificateRoot,
        CIRCUIT_REGISTRY_ROOT: circuitRoot,
      },
      stdio: "ignore",
    })

    const files = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req) {
        const path = new URL(req.url).pathname
        let file: string | undefined
        if (path === `/root/${certificateRoot}.json`) file = CERTIFICATES_FILE
        else if (/^\/by-(version|root)\/[^/]+\/manifest\.json$/.test(path))
          file = join(CACHE_DIR, "by-version", circuitVersion, "manifest.json")
        else if (path.startsWith("/by-hash/")) file = join(CACHE_DIR, path)
        if (!file || !existsSync(file)) return new Response("not found", { status: 404 })
        return new Response(Bun.file(file), { headers: { "content-type": "application/json" } })
      },
    })
    const filesUrl = `http://127.0.0.1:${files.port}`

    return {
      rpcUrl,
      registry: {
        rpcUrl,
        rootRegistry,
        registryHelper,
        packagedCertsUrlGenerator: (_chainId, root) => `${filesUrl}/root/${root}.json`,
        circuitManifestUrlGenerator: (_chainId, { root, version }) =>
          version
            ? `${filesUrl}/by-version/${version}/manifest.json`
            : `${filesUrl}/by-root/${root}/manifest.json`,
        packagedCircuitUrlGenerator: (_chainId, hash) => `${filesUrl}/by-hash/${hash}.json`,
      },
      stop: () => {
        files.stop(true)
        anvil.kill()
      },
    }
  } catch (error) {
    anvil.kill()
    throw error
  }
}
