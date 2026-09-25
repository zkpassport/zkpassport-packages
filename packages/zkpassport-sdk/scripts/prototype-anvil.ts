/**
 * PROTOTYPE — throwaway spike, not for merge. Step 3 of 3 (step 1: prototype-node-proofs.ts,
 * step 2: prototype-bridge.ts).
 *
 * Question: can the step 2 flow run on a local devnet, with no Sepolia or CDN calls at run time?
 *
 * Setup (the only network use): mirror the published 0.21.0 manifest and the 5 packaged circuits
 * john needs into .prototype-cache/. Then, all local:
 *   - anvil on a free port; registry-contracts' script/test/deploy-root-registry.sh and
 *     seed-registries.sh, with the committed zkpassport-utils/tests/fixtures/root-certs-v1.json
 *     root (549 certs incl. the 2 ZKR CSCAs) as the latest certificate root
 *   - a static file server with the layout the registry's dev URLs use (/root, /by-version, /by-hash)
 *   - @zkpassport/registry swapped (bun mock.module) for a RegistryClient pinned to that anvil and
 *     file server. This stands in for the SDK network option that doesn't exist yet: the SDK
 *     hard-codes RegistryClient({ chainId: devMode ? 11155111 : 1 }).
 *   - a fetch guard that blocks and records every non-local request
 *
 * Needs anvil, forge and jq on PATH, registry-contracts built (forge build, forge-std submodule
 * initialised) and the relay cloned as for step 2.
 *
 * Run from the repo root: bun packages/zkpassport-sdk/scripts/prototype-anvil.ts
 */
import { mock } from "bun:test"
import { execSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { dirname, join, resolve } from "node:path"
// Nothing that imports @zkpassport/registry may load before mock.module below, so no static
// import of prototype-prove / prototype-flow here.
const CIRCUIT_VERSION = "0.21.0"
const log = (...args: unknown[]) =>
  console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...args)

const CONTRACTS_DIR = resolve(import.meta.dir, "../../registry-contracts")
const CERTS_FIXTURE = resolve(
  import.meta.dir,
  "../../zkpassport-utils/tests/fixtures/root-certs-v1.json",
)
const CACHE_DIR = resolve(import.meta.dir, ".prototype-cache")
const CDN = "https://circuits2.zkpassport.id/testnet"
// The circuits john's fast-mode age + nationality request needs (names found in step 1)
const CIRCUITS = [
  "sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256",
  "sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256",
  "data_check_integrity_sa_sha256_dg_sha256",
  "compare_age",
  "disclose_bytes",
]

function writeFile(path: string, body: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

// --- 1. Mirror the published circuit files once (plain fetch follows the CDN's 302s and gunzips) ---
async function mirrorCircuits() {
  const manifestPath = join(CACHE_DIR, "by-version", CIRCUIT_VERSION, "manifest.json")
  if (!existsSync(manifestPath)) {
    log(`mirroring ${CDN}/by-version/${CIRCUIT_VERSION}/manifest.json`)
    writeFile(
      manifestPath,
      await (await fetch(`${CDN}/by-version/${CIRCUIT_VERSION}/manifest.json`)).text(),
    )
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
  for (const name of CIRCUITS) {
    const hash = manifest.circuits[name].hash
    const path = join(CACHE_DIR, "by-hash", `${hash}.json`)
    if (!existsSync(path)) {
      log(`mirroring ${name} (${hash.slice(0, 12)}…)`)
      writeFile(path, await (await fetch(`${CDN}/by-hash/${hash}.json`)).text())
    }
  }
  return manifest as { version: string; root: string }
}

async function freePort(): Promise<number> {
  return new Promise((ok) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      server.close(() => ok(port))
    })
  })
}

// --- 2. anvil + registry deploy + seed, with the scripts the registry-sdk tests use ---
async function startDevnet(certificateRoot: string, circuitRoot: string) {
  const port = await freePort()
  const rpcUrl = `http://127.0.0.1:${port}`
  const anvil = spawn("anvil", ["--port", `${port}`, "--silent"], { stdio: "ignore" })
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      })
      if (res.ok) break
    } catch {}
    if (i > 100) throw new Error("anvil did not start")
    await Bun.sleep(100)
  }
  const env = { ...process.env, RPC_URL: rpcUrl }
  const deployOutput = execSync("script/test/deploy-root-registry.sh", {
    cwd: CONTRACTS_DIR,
    env,
    encoding: "utf8",
  })
  const rootRegistry = deployOutput.match(/RootRegistry deployed at: (0x[a-fA-F0-9]{40})/)![1]
  const registryHelper = deployOutput.match(/RegistryHelper deployed at: (0x[a-fA-F0-9]{40})/)![1]
  execSync("script/test/seed-registries.sh", {
    cwd: CONTRACTS_DIR,
    env: { ...env, CERTIFICATE_REGISTRY_ROOT: certificateRoot, CIRCUIT_REGISTRY_ROOT: circuitRoot },
    stdio: "ignore",
  })
  log(`anvil on ${rpcUrl}: RootRegistry ${rootRegistry}, RegistryHelper ${registryHelper}`)
  log(
    `seeded latest certificate root ${certificateRoot.slice(0, 12)}…, circuit root ${circuitRoot.slice(0, 12)}…`,
  )
  return { anvil, rpcUrl, rootRegistry, registryHelper }
}

// --- 3. Static files in the layout of the registry's dev URLs ---
function startFileServer(certificateRoot: string) {
  const hits: string[] = []
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const path = new URL(req.url).pathname
      hits.push(path)
      let file: string | undefined
      if (path === `/root/${certificateRoot}.json`) file = CERTS_FIXTURE
      else if (
        /^\/by-version\/[^/]+\/manifest\.json$/.test(path) ||
        /^\/by-root\/[^/]+\/manifest\.json$/.test(path)
      )
        file = join(CACHE_DIR, "by-version", CIRCUIT_VERSION, "manifest.json")
      else if (path.startsWith("/by-hash/")) file = join(CACHE_DIR, path)
      if (!file || !existsSync(file)) return new Response("not found", { status: 404 })
      return new Response(Bun.file(file), { headers: { "content-type": "application/json" } })
    },
  })
  return { server, url: `http://127.0.0.1:${server.port}`, hits }
}

async function main() {
  const manifest = await mirrorCircuits()
  const certificateRoot: string = JSON.parse(readFileSync(CERTS_FIXTURE, "utf8")).root
  const devnet = await startDevnet(certificateRoot, manifest.root)
  const files = startFileServer(certificateRoot)
  log(`file server on ${files.url}`)

  // --- 4. Every RegistryClient, the SDK's included, now reads anvil and the file server ---
  const real = await import("@zkpassport/registry")
  const requestedChains: number[] = []
  class AnvilRegistryClient extends real.RegistryClient {
    constructor(options: any) {
      requestedChains.push(options?.chainId)
      super({
        ...options,
        chainId: 31337,
        rpcUrl: devnet.rpcUrl,
        rootRegistry: devnet.rootRegistry,
        registryHelper: devnet.registryHelper,
        packagedCertsUrlGenerator: (_chainId: number, root: string) =>
          `${files.url}/root/${root}.json`,
        circuitManifestUrlGenerator: (
          _chainId: number,
          { root, version }: { root?: string; version?: string },
        ) =>
          version
            ? `${files.url}/by-version/${version}/manifest.json`
            : `${files.url}/by-root/${root}/manifest.json`,
        packagedCircuitUrlGenerator: (_chainId: number, hash: string) =>
          `${files.url}/by-hash/${hash}.json`,
      })
    }
  }
  mock.module("@zkpassport/registry", () => ({ ...real, RegistryClient: AnvilRegistryClient }))

  // --- 5. From here on, only 127.0.0.1 is reachable through fetch ---
  const blocked: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return realFetch(input, init)
    blocked.push(url)
    throw new Error(`prototype network guard: blocked ${url}`)
  }) as typeof fetch

  let exitCode = 1
  try {
    const { runBridgeFlow } = await import("./prototype-flow")
    const { verification, roundTripMs } = await runBridgeFlow()
    log(
      `RegistryClient constructions: ${requestedChains.length} (chainIds requested by callers: ${[...new Set(requestedChains)].join(", ")}; all served by anvil 31337)`,
    )
    log(`file server requests: ${files.hits.length} (${[...new Set(files.hits)].join(", ")})`)
    log(
      `blocked non-local fetches: ${blocked.length}${blocked.length ? " → " + blocked.join(", ") : ""}`,
    )
    log(`round trip ${roundTripMs} ms`)
    log(
      verification.verified
        ? "ANSWER: yes — the full flow runs on anvil and the proofs verify"
        : "ANSWER: no — see results above",
    )
    exitCode = verification.verified ? 0 : 1
  } finally {
    globalThis.fetch = realFetch
    files.server.stop(true)
    devnet.anvil.kill()
  }
  process.exit(exitCode)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
