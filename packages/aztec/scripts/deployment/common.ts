/**
 * Shared plumbing for the deployment scripts (create-schnorr-account.ts,
 * deploy-testnet.ts, deploy-mainnet.ts, seed-registry.ts): network defaults, env
 * parsing, node connection checks, deployer-account derivation, SponsoredFPC
 * verification, and deployment-record paths.
 */
import { type NoirCompiledContract, loadContractArtifact } from "@aztec/aztec.js/abi"
import { AztecAddress } from "@aztec/aztec.js/addresses"
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts"
import { Fr } from "@aztec/aztec.js/fields"
import { createAztecNodeClient } from "@aztec/aztec.js/node"
import { SPONSORED_FPC_SALT } from "@aztec/constants"
import { deriveMasterMessageSigningSecretKey } from "@aztec/stdlib/keys"
import { EmbeddedWallet } from "@aztec/wallets/embedded"
import { mkdirSync, writeFileSync } from "fs"
import { fileURLToPath } from "node:url"
import SponsoredFPCJson from "noir-contracts-5.1.0/artifacts/sponsored_fpc_contract-SponsoredFPC" with { type: "json" }

export type Network = "testnet" | "mainnet"

export function defaultNodeUrl(network: Network): string {
  return network === "testnet"
    ? "https://v5.testnet.rpc.aztec-labs.com"
    : "https://aztec-mainnet.drpc.org"
}

/** zkpassport_registry_contract::types::MODE_VALID_WITHIN_WINDOW — the deployment default. */
export const MODE_VALID_WITHIN_WINDOW = 3

/** Production validity window in seconds, matching L1's registry deployments (run-e2e.ts). */
export const VALIDITY_WINDOW = 86400n

/** Client-side proving is minutes-scale; never let the tx wait time out first. */
export const WAIT = { timeout: 3600, interval: 2 } as const

/** An account secret from the environment; only create-schnorr-account.ts mints secrets. */
export function requiredSecret(envVar: string): Fr {
  const env = process.env[envVar]
  if (!env) {
    console.error(
      `${envVar} is required: mint an account with deployment/create-schnorr-account.ts and export its secret from your secret manager.`,
    )
    process.exit(1)
  }
  return Fr.fromString(env)
}

/** The SALT env var as an Fr; the default 0 keeps derived addresses reproducible. */
export function saltFromEnv(): Fr {
  return process.env.SALT ? Fr.fromString(process.env.SALT) : new Fr(0)
}

/** A role address that must be stated explicitly: there is no deployer fallback. */
export function requiredRole(envVar: string): AztecAddress {
  const env = process.env[envVar]
  if (!env) {
    console.error(
      `${envVar} is required. Roles never default to the deployer: pass the deployer address explicitly if that is really intended.`,
    )
    process.exit(1)
  }
  return AztecAddress.fromStringUnsafe(env)
}

export type NodeClient = ReturnType<typeof createAztecNodeClient>

/**
 * Connect to the node and refuse early on the failure modes that otherwise surface as
 * anything but their cause: a node version outside the pinned range (networks are
 * version-dependent; v5.1.x is accepted alongside v5.2.x because the two interoperate
 * per the v5.2.0 release notes, and mainnet nodes still report 5.1.0 client binaries),
 * and, on mainnet, a node whose L1 chain is not Ethereum mainnet.
 */
export async function connectAndCheckNode(nodeUrl: string, network: Network) {
  const node = createAztecNodeClient(nodeUrl)
  const { nodeVersion, l1ChainId, rollupVersion } = await node.getNodeInfo()
  console.log(
    `node ${nodeUrl}: version=${nodeVersion} l1ChainId=${l1ChainId} rollupVersion=${rollupVersion}`,
  )

  if (network === "mainnet" && l1ChainId !== 1) {
    throw new Error(`l1ChainId is ${l1ChainId}, not 1: this node is not Aztec mainnet`)
  }

  if (!nodeVersion.startsWith("5.2.") && !nodeVersion.startsWith("5.1.")) {
    throw new Error(
      `node version ${nodeVersion} is not 5.1.x/5.2.x — this repo's toolchain and artifacts are pinned to 5.2.0`,
    )
  }

  return { node, nodeVersion, l1ChainId, rollupVersion }
}

/** In-memory wallet. Disable proving for derive-only flows that never send a tx. */
export async function createEphemeralWallet(nodeUrl: string, proverEnabled: boolean) {
  return EmbeddedWallet.create(nodeUrl, {
    ephemeral: true,
    pxe: { proverEnabled },
  })
}

/**
 * Rebuild the initializerless Schnorr account whose address is a pure function of
 * (secret, salt). No account-deploy tx is needed.
 */
export async function deriveSchnorrAccount(wallet: EmbeddedWallet, secretKey: Fr, salt: Fr) {
  return wallet.createSchnorrInitializerlessAccount(
    secretKey,
    salt,
    deriveMasterMessageSigningSecretKey(secretKey),
  )
}

/**
 * The live testnet's SponsoredFPC was deployed from the 5.1.0 artifact, so derive the
 * instance from the pinned `noir-contracts-5.1.0` alias and verify address and class
 * against the chain: a mismatch means the network swapped its FPC, and fee payment
 * would fail with something far less legible than this error. Registers the FPC with
 * the wallet when one is passed (required before paying through it).
 */
export async function verifySponsoredFPC(node: NodeClient, wallet?: EmbeddedWallet) {
  const fpcArtifact = loadContractArtifact(SponsoredFPCJson as NoirCompiledContract)
  const fpc = await getContractInstanceFromInstantiationParams(fpcArtifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  })

  const fpcOnChain = await node.getContract(fpc.address)
  if (!fpcOnChain) {
    throw new Error(
      `SponsoredFPC not found on-chain at derived address ${fpc.address} — the network's FPC no longer matches the pinned 5.1.0 artifact`,
    )
  }
  if (!fpcOnChain.currentContractClassId.equals(fpc.currentContractClassId)) {
    throw new Error(
      `SponsoredFPC class mismatch at ${fpc.address}: on-chain ${fpcOnChain.currentContractClassId} vs artifact ${fpc.currentContractClassId}`,
    )
  }

  if (wallet) {
    await wallet.registerContract(fpc, fpcArtifact)
  }
  console.log(`sponsored FPC verified on-chain: ${fpc.address}`)

  return fpc
}

/** Absolute path of a deployment record under the gitignored ../deployments/. */
export function deploymentRecordPath(fileName: string): string {
  return fileURLToPath(new URL(`../deployments/${fileName}`, import.meta.url))
}

/** Write a deployment record, creating deployments/ on demand. */
export function writeDeploymentRecord(fileName: string, record: object): void {
  mkdirSync(fileURLToPath(new URL("../deployments", import.meta.url)), { recursive: true })
  const path = deploymentRecordPath(fileName)
  writeFileSync(path, JSON.stringify(record, null, 2) + "\n")
  console.log(`wrote ${path}`)
}
