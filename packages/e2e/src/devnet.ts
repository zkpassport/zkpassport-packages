import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { createRegistryClient, getNetworkConstants } from "@zkpassport/registry"
import { getIdFromChain } from "@zkpassport/utils"

const SEPOLIA = getNetworkConstants(getIdFromChain("ethereum_sepolia"))

export const SEPOLIA_FILE_HOSTS = getFileHosts(SEPOLIA)

export type RegistryOverrides = NonNullable<Parameters<typeof createRegistryClient>[1]>

export type Devnet = {
  rpcUrl: string
  /** Options for a Sepolia registry client to read this fork */
  registry: RegistryOverrides
  stop: () => void
}

/**
 * Start Anvil with a Sepolia fork at its latest block.
 */
export async function startDevnet(): Promise<Devnet> {
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

/** Hosts of the CDNs a network's certificates and circuits are read from */
function getFileHosts(network: ReturnType<typeof getNetworkConstants>): string[] {
  return [network.packagedCertificatesUrl, network.circuitUrl].map((url) => new URL(url).hostname)
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
