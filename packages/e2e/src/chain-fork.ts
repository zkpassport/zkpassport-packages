import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { createRegistryClient, type RegistryClient } from "@zkpassport/registry"
import type { CircuitManifest } from "@zkpassport/utils"
import {
  type Address,
  createTestClient,
  type Hex,
  http,
  parseAbi,
  parseEther,
  publicActions,
  walletActions,
  zeroHash,
} from "viem"

export type RegistryOverrides = NonNullable<Parameters<typeof createRegistryClient>[1]>

export type ChainFork = {
  rpcUrl: string
  /** Options for a registry client to read this fork */
  registry: RegistryOverrides
  /**
   * Make `manifest`'s root the latest root of the circuit registry that `registry` reads on this
   * fork, sending the update as the registry's oracle
   */
  registerCircuitRoot: (manifest: CircuitManifest, registry: RegistryClient) => Promise<void>
  stop: () => void
}

const CIRCUIT_REGISTRY_ABI = parseAbi([
  "function oracle() view returns (address)",
  "function updateRoot(bytes32 newRoot, bytes32 currentRoot, uint256 timestamp, uint256 leaves, bytes32 cid)",
])

export type FetchProxy = { blocked: string[]; stop: () => void }

/**
 * Start Anvil with a fork of the chain at `forkUrl`, at its latest block.
 */
export async function startChainFork(forkUrl: string): Promise<ChainFork> {
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

  return {
    rpcUrl,
    registry: { rpcUrl },
    registerCircuitRoot: (manifest, registry) => registerCircuitRoot(rpcUrl, manifest, registry),
    stop: () => anvil.kill(),
  }
}

/**
 * Make fetch() answer the URLs `serve` has a response for, reach only this machine and
 * `allowedHosts` otherwise, and record every other URL something tried to fetch.
 * It covers fetch only: child processes and libraries using their own HTTP stack (e.g. bb.js
 * downloading its CRS) bypass it.
 */
export function startFetchProxy(
  allowedHosts: string[] = [],
  serve: (url: string) => Response | undefined = () => undefined,
): FetchProxy {
  const allowed = ["127.0.0.1", "localhost", ...allowedHosts]
  const blocked: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const localResponse = serve(url)
    if (localResponse) {
      return localResponse
    }

    if (allowed.includes(new URL(url).hostname)) {
      return realFetch(input, init)
    }

    blocked.push(url)
    throw new Error(`e2e fetch proxy: blocked ${url}`)
  }) as typeof fetch
  return { blocked, stop: () => (globalThis.fetch = realFetch) }
}

async function registerCircuitRoot(
  rpcUrl: string,
  manifest: CircuitManifest,
  registry: RegistryClient,
) {
  const client = createTestClient({ mode: "anvil", transport: http(rpcUrl) })
    .extend(publicActions)
    .extend(walletActions)
  const address = (await registry.getCircuitRegistryAddress()) as Address
  const oracle = await client.readContract({
    address,
    abi: CIRCUIT_REGISTRY_ABI,
    functionName: "oracle",
  })
  const { timestamp } = await client.getBlock()

  await client.impersonateAccount({ address: oracle })
  await client.setBalance({ address: oracle, value: parseEther("1") })
  try {
    const hash = await client.writeContract({
      account: oracle,
      chain: null,
      address,
      abi: CIRCUIT_REGISTRY_ABI,
      functionName: "updateRoot",
      args: [
        manifest.root as Hex,
        (await registry.getLatestCircuitRoot()) as Hex,
        timestamp,
        BigInt(Object.keys(manifest.circuits).length),
        zeroHash,
      ],
    })
    const { status } = await client.waitForTransactionReceipt({ hash })
    if (status !== "success") {
      throw new Error(`Registering circuit root ${manifest.root} on the fork reverted`)
    }
  } finally {
    await client.stopImpersonatingAccount({ address: oracle })
  }
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
