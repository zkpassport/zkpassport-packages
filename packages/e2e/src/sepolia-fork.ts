import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { createRegistryClient, getNetworkConstants } from "@zkpassport/registry"
import { getIdFromChain } from "@zkpassport/utils"

const SEPOLIA = getNetworkConstants(getIdFromChain("ethereum_sepolia"))

export const SEPOLIA_FILE_HOSTS = [SEPOLIA.packagedCertificatesUrl, SEPOLIA.circuitUrl].map(
  (url) => new URL(url).hostname,
)

export type RegistryOverrides = NonNullable<Parameters<typeof createRegistryClient>[1]>

export type SepoliaFork = {
  rpcUrl: string
  /** Options for a Sepolia registry client to read this fork */
  registry: RegistryOverrides
  stop: () => void
}

export type FetchProxy = { blocked: string[]; restore: () => void }

/**
 * Start Anvil with a Sepolia fork at its latest block.
 */
export async function startSepoliaFork(): Promise<SepoliaFork> {
  const forkUrl = process.env.SEPOLIA_RPC_URL || SEPOLIA.rpcUrl
  const port = await freePort()
  const rpcUrl = `http://127.0.0.1:${port}`
  const anvil = spawn("anvil", ["--fork-url", forkUrl, "--port", `${port}`, "--silent"], {
    stdio: "ignore",
  })

  try {
    await waitForRpc(rpcUrl)
  } catch (error) {
    anvil.kill()
    throw error
  }

  return { rpcUrl, registry: { rpcUrl }, stop: () => anvil.kill() }
}

/**
 * Make fetch() reach only this machine and `allowedHosts`, and record every other URL something
 * tried to fetch.
 * It covers fetch only: child processes and libraries using their own HTTP stack (e.g. bb.js
 * downloading its CRS) bypass it.
 */
export function startFetchProxy(allowedHosts: string[] = []): FetchProxy {
  const allowed = ["127.0.0.1", "localhost", ...allowedHosts]
  const blocked: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (allowed.includes(new URL(url).hostname)) {
      return realFetch(input, init)
    }

    blocked.push(url)
    throw new Error(`e2e fetch proxy: blocked ${url}`)
  }) as typeof fetch
  return { blocked, restore: () => (globalThis.fetch = realFetch) }
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
