import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { createRegistryClient, type RegistryClient } from "@zkpassport/registry"
import { circuitVersionToBytes32, type CircuitManifest } from "@zkpassport/utils"
import RegistryInstance from "registry-contracts/out/RegistryInstance.sol/RegistryInstance.json"
import RootVerifier from "registry-contracts/out/RootVerifier.sol/RootVerifier.json"
import SubVerifier from "registry-contracts/out/SubVerifier.sol/SubVerifier.json"
import {
  type Abi,
  type Address,
  createTestClient,
  type Hash,
  type Hex,
  http,
  parseEther,
  publicActions,
  walletActions,
  zeroAddress,
  zeroHash,
} from "viem"
import type { OuterEvmVerifier } from "./packaged-circuits"

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
  /**
   * Make the RootVerifier at `rootVerifier` verify `version`'s outer EVM proofs with `verifiers`,
   * through a SubVerifier deployed on this fork with the OPRF key hash of `settingsFrom`'s
   * SubVerifier, sending everything as the RootVerifier's admin
   */
  registerSubVerifier: (options: {
    rootVerifier: Address
    version: string
    verifiers: OuterEvmVerifier[]
    settingsFrom: string
  }) => Promise<void>
  stop: () => void
}

export type FetchProxy = { blocked: string[]; stop: () => void }

type AnvilClient = ReturnType<typeof createAnvilClient>

// A JSON import types the ABIs' fields as plain strings, not the literals viem's Abi expects
const REGISTRY_INSTANCE_ABI = RegistryInstance.abi as Abi
const ROOT_VERIFIER_ABI = RootVerifier.abi as Abi
const SUB_VERIFIER_ABI = SubVerifier.abi as Abi

/**
 * Start Anvil with a fork of the chain at `forkUrl`, at its latest block, mining a block every
 * second so that block.timestamp keeps up with the proofs' dates.
 */
export async function startChainFork(forkUrl: string): Promise<ChainFork> {
  const port = await freePort()
  const rpcUrl = `http://127.0.0.1:${port}`
  const anvil = spawn(
    "anvil",
    ["--fork-url", forkUrl, "--port", `${port}`, "--block-time", "1", "--silent"],
    { stdio: "ignore" },
  )

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
    registerSubVerifier: (options) => registerSubVerifier(rpcUrl, options),
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
  const client = createAnvilClient(rpcUrl)
  const address = (await registry.getCircuitRegistryAddress()) as Address
  const oracle = (await client.readContract({
    address,
    abi: REGISTRY_INSTANCE_ABI,
    functionName: "oracle",
  })) as Address
  const latestRoot = (await registry.getLatestCircuitRoot()) as Hex
  const { timestamp } = await client.getBlock()

  await sendAs(client, oracle, async () => {
    const hash = await client.writeContract({
      account: oracle,
      chain: null,
      address,
      abi: REGISTRY_INSTANCE_ABI,
      functionName: "updateRoot",
      args: [
        manifest.root as Hex,
        latestRoot,
        timestamp,
        BigInt(Object.keys(manifest.circuits).length),
        zeroHash,
      ],
    })
    await waitForSuccess(client, hash, `Registering circuit root ${manifest.root}`)
  })
}

async function registerSubVerifier(
  rpcUrl: string,
  {
    rootVerifier,
    version,
    verifiers,
    settingsFrom,
  }: {
    rootVerifier: Address
    version: string
    verifiers: OuterEvmVerifier[]
    settingsFrom: string
  },
) {
  const client = createAnvilClient(rpcUrl)
  const readRootVerifier = (functionName: string, args: unknown[] = []) =>
    client.readContract({ address: rootVerifier, abi: ROOT_VERIFIER_ABI, functionName, args })
  const versionKey = circuitVersionToBytes32(version) as Hex
  const admin = (await readRootVerifier("admin")) as Address
  const currentSubVerifier = (await readRootVerifier("subverifiers", [versionKey])) as Address
  const globalOPRFPubKeyHash = (await client.readContract({
    address: (await readRootVerifier("subverifiers", [
      circuitVersionToBytes32(settingsFrom),
    ])) as Address,
    abi: SUB_VERIFIER_ABI,
    functionName: "globalOPRFPubKeyHash",
  })) as Hex

  await sendAs(client, admin, async () => {
    const proofVerifiers = []
    for (const { vkeyHash, bytecode } of verifiers) {
      const verifier = await deploy(
        client,
        admin,
        { abi: [], bytecode },
        `the verifier for ${vkeyHash}`,
      )
      proofVerifiers.push({ vkeyHash, verifier })
    }
    const subVerifier = await deploy(
      client,
      admin,
      {
        abi: SUB_VERIFIER_ABI,
        bytecode: SubVerifier.bytecode.object as Hex,
        args: [admin, rootVerifier, globalOPRFPubKeyHash],
      },
      "the SubVerifier",
    )

    const addProofVerifiers = await client.writeContract({
      account: admin,
      chain: null,
      address: subVerifier,
      abi: SUB_VERIFIER_ABI,
      functionName: "addProofVerifiers",
      args: [proofVerifiers],
    })
    await waitForSuccess(client, addProofVerifiers, "Adding the proof verifiers")

    const register = await client.writeContract({
      account: admin,
      chain: null,
      address: rootVerifier,
      abi: ROOT_VERIFIER_ABI,
      functionName: currentSubVerifier === zeroAddress ? "addSubVerifier" : "updateSubVerifier",
      args: [versionKey, subVerifier],
    })
    await waitForSuccess(client, register, `Registering the SubVerifier for ${version}`)
  })
}

function createAnvilClient(rpcUrl: string) {
  // Blocks come every second, so poll for receipts more often than viem's default
  return createTestClient({ mode: "anvil", transport: http(rpcUrl), pollingInterval: 250 })
    .extend(publicActions)
    .extend(walletActions)
}

/** Run `send` with `account` impersonated and funded */
async function sendAs<T>(client: AnvilClient, account: Address, send: () => Promise<T>) {
  await client.impersonateAccount({ address: account })
  await client.setBalance({ address: account, value: parseEther("1") })
  try {
    return await send()
  } finally {
    await client.stopImpersonatingAccount({ address: account })
  }
}

async function deploy(
  client: AnvilClient,
  account: Address,
  { abi, bytecode, args = [] }: { abi: Abi; bytecode: Hex; args?: unknown[] },
  name: string,
): Promise<Address> {
  const hash = await client.deployContract({ account, chain: null, abi, bytecode, args })
  const { contractAddress } = await waitForSuccess(client, hash, `Deploying ${name}`)
  return contractAddress as Address
}

async function waitForSuccess(client: AnvilClient, hash: Hash, action: string) {
  const receipt = await client.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") {
    throw new Error(`${action} reverted on the fork`)
  }
  return receipt
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
