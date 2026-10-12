import { execFileSync, spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createServer } from "node:net"
import { resolve } from "node:path"
import { gzipSync } from "node:zlib"
import { createRegistryClient, getNetworkConstants } from "@zkpassport/registry"
import { getIdFromChain, SANCTIONS_REGISTRY_ID } from "@zkpassport/utils"

export const CACHE_DIR = resolve(import.meta.dir, "../.cache")
/** Anvil's second account, made the Sanctions Registry's oracle by takeOverSanctionsOracle */
export const ORACLE_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"

const SEPOLIA = getNetworkConstants(getIdFromChain("ethereum_sepolia"))
const ORACLE_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

export const SEPOLIA_FILE_HOSTS = [SEPOLIA.packagedCertificatesUrl, SEPOLIA.circuitUrl].map(
  (url) => new URL(url).hostname,
)

export type RegistryOverrides = NonNullable<Parameters<typeof createRegistryClient>[1]>

export type SepoliaFork = {
  rpcUrl: string
  /** Options for a Sepolia registry client to read this fork and the sanctions trees it serves */
  registry: RegistryOverrides
  /** Serve a serialised sanctions tree for its root */
  serveSanctionsTree: (root: string, treeFile: string) => void
  stop: () => void
}

/**
 * Start Anvil with a Sepolia fork at its latest block, and a file server for sanctions trees.
 */
export async function startSepoliaFork(): Promise<SepoliaFork> {
  const forkUrl = process.env.SEPOLIA_RPC_URL || SEPOLIA.rpcUrl
  const port = await freePort()
  const rpcUrl = `http://127.0.0.1:${port}`
  const anvil = spawn("anvil", ["--fork-url", forkUrl, "--port", `${port}`, "--silent"], {
    stdio: "ignore",
  })
  const sanctionsTrees = new Map<string, ReturnType<typeof gzipSync>>()
  let files: ReturnType<typeof Bun.serve> | undefined
  try {
    await waitForRpc(rpcUrl)

    files = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        const root = new URL(request.url).pathname.match(
          /^\/sanctions\/(0x[0-9a-f]{64})\.tree\.json\.gz$/,
        )?.[1]
        const tree = root ? sanctionsTrees.get(root) : undefined
        if (!tree) {
          return new Response("not found", { status: 404 })
        }
        // Served gzip-encoded, like the sanctions CDN
        return new Response(tree, {
          headers: { "content-type": "application/json", "content-encoding": "gzip" },
        })
      },
    })
    const filesUrl = `http://127.0.0.1:${files.port}`

    return {
      rpcUrl,
      registry: {
        rpcUrl,
        sanctionsTreeUrlGenerator: (_chainId, root) => `${filesUrl}/sanctions/${root}.tree.json.gz`,
      },
      serveSanctionsTree: (root, treeFile) => {
        sanctionsTrees.set(root.toLowerCase(), gzipSync(readFileSync(treeFile)))
      },
      stop: () => {
        files?.stop(true)
        anvil.kill()
      },
    }
  } catch (error) {
    files?.stop(true)
    anvil.kill()
    throw error
  }
}

/**
 * Make anvil's second account the oracle of the forked Sanctions Registry, by sending setOracle
 * from the registry's admin, impersonated, so a publisher holding ORACLE_PRIVATE_KEY can publish
 */
export async function takeOverSanctionsOracle(fork: SepoliaFork) {
  const registry = await createRegistryClient("ethereum_sepolia", fork.registry).getRegistryAddress(
    SANCTIONS_REGISTRY_ID,
  )
  const admin = cast(["call", registry, "admin()(address)"], fork)

  cast(["rpc", "anvil_impersonateAccount", admin], fork)
  cast(["rpc", "anvil_setBalance", admin, "0x56BC75E2D63100000"], fork)
  cast(
    ["send", registry, "setOracle(address)", ORACLE_ADDRESS, "--unlocked", "--from", admin],
    fork,
  )
}

/**
 * Make fetch() reach only this machine and `allowedHosts`, and record every other URL something
 * tried to fetch.
 * It covers fetch only: child processes and libraries using their own HTTP stack (e.g. bb.js
 * downloading its CRS) are not intercepted.
 */
export function guardNetwork(allowedHosts: string[] = []): {
  blocked: string[]
  restore: () => void
} {
  const allowed = ["127.0.0.1", "localhost", ...allowedHosts]
  const blocked: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (allowed.includes(new URL(url).hostname)) {
      return realFetch(input, init)
    }

    blocked.push(url)
    throw new Error(`e2e network guard: blocked ${url}`)
  }) as typeof fetch
  return { blocked, restore: () => (globalThis.fetch = realFetch) }
}

function cast(args: string[], fork: SepoliaFork): string {
  return execFileSync("cast", [...args, "--rpc-url", fork.rpcUrl], { encoding: "utf8" }).trim()
}

async function waitForRpc(rpcUrl: string) {
  for (let attempt = 0; attempt <= 300; attempt++) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      })
      if (response.ok) {
        return
      }
    } catch {
      // Not accepting connections yet
    }
    await Bun.sleep(100)
  }
  throw new Error(`Nothing answered on ${rpcUrl}`)
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort) => {
    const server = createServer().listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolvePort(port))
    })
  })
}
