/**
 * The local network registry: a ZKPassport registry for tests, at the same address in TXE and on an
 * Aztec local network.
 *
 * Note: `noir/verifier/src/local_network_registry.nr` is the source of truth. This module mirrors
 * its salt and validity window, and derives the rest from the registry artifact and
 * @aztec-labs/accounts.
 */
import { getInitialTestAccountsData } from "@aztec-labs/accounts/testing"
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { Contract } from "@aztec-labs/aztec.js/contracts"
import { Fr } from "@aztec-labs/aztec.js/fields"
import type { Wallet } from "@aztec-labs/aztec.js/wallet"
import { getContractInstanceFromInstantiationParams } from "@aztec-labs/stdlib/contract"

import { ZKPassportRegistryArtifact } from "./artifact.ts"

/**
 * The salt the local network registry is deployed with:
 * `sha256_to_field("ZKPASSPORT::AZTEC::LOCAL_NETWORK_REGISTRY")`.
 */
export const LOCAL_NETWORK_REGISTRY_SALT = Fr.fromHexString(
  "0x00d0a131d2321f6a003e7da610302a5684fe4234070a9e936f1ac355c3bfb182",
)

/** The local network registry's root validity window, in seconds. */
export const LOCAL_NETWORK_REGISTRY_VALIDITY_WINDOW = 86400

// Mirrors of the registry's MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE and REGISTRY_CIRCUIT
const MODE_VALID_WITHIN_WINDOW = 3
const REGISTRY_CERTIFICATE = 1n
const REGISTRY_CIRCUIT = 2n

/** What `seedLocalNetworkRegistry` registers. */
export interface LocalNetworkRegistrySeed {
  /** The circuit-manifest version to accept `vkHash` for. */
  version: Fr | bigint
  certificateRoot: Fr
  circuitRoot: Fr
  /** The outer circuit's vk hash. */
  vkHash: Fr
  /** When the roots become valid, in seconds since the Unix epoch. */
  validFrom: bigint
}

/**
 * The local network registry's address in TXE and on a local network, computed from the registry
 * artifact.
 */
export async function getLocalNetworkRegistryAddress(): Promise<AztecAddress> {
  const instance = await getContractInstanceFromInstantiationParams(ZKPassportRegistryArtifact, {
    constructorArtifact: "constructor",
    constructorArgs: await constructorArgs(),
    salt: LOCAL_NETWORK_REGISTRY_SALT,
    deployer: AztecAddress.ZERO,
  })
  return instance.address
}

/**
 * Deploys the local network registry on a local network.
 *
 * The wallet must hold the local network's test account 0, which sends the deployment, e.g. through
 * `registerInitialLocalNetworkAccountsInWallet`.
 */
export async function deployLocalNetworkRegistry(wallet: Wallet): Promise<Contract> {
  const { admin } = await localNetworkRegistryAccounts()
  const { contract } = await Contract.deploy(
    wallet,
    ZKPassportRegistryArtifact,
    await constructorArgs(),
    "constructor",
    { salt: LOCAL_NETWORK_REGISTRY_SALT, universalDeploy: true },
  ).send({ from: admin })
  return contract
}

/**
 * Registers a certificate root and a circuit root in the local network registry, and accepts a vk
 * hash for a circuit-manifest version.
 *
 * The wallet must hold the local network's test accounts 0 and 1. The registry applies these after
 * its delay: advance the network's time past it, and into the freshness window of the proof being
 * verified, before verifying.
 */
export async function seedLocalNetworkRegistry(
  wallet: Wallet,
  seed: LocalNetworkRegistrySeed,
): Promise<void> {
  const { admin, operator } = await localNetworkRegistryAccounts()
  const registry = Contract.at(
    await getLocalNetworkRegistryAddress(),
    ZKPassportRegistryArtifact,
    wallet,
  )
  await registry.methods
    .update_root(REGISTRY_CERTIFICATE, seed.certificateRoot, 0n, seed.validFrom)
    .send({ from: operator })
  await registry.methods
    .update_root(REGISTRY_CIRCUIT, seed.circuitRoot, 0n, seed.validFrom)
    .send({ from: operator })
  await registry.methods.add_accepted_vk(seed.version, seed.vkHash).send({ from: admin })
  await registry.methods.set_version_status(seed.version, true).send({ from: admin })
}

// The local network registry's admin and operator: the local network's test accounts 0 and 1
async function localNetworkRegistryAccounts(): Promise<{
  admin: AztecAddress
  operator: AztecAddress
}> {
  const [admin, operator] = await getInitialTestAccountsData()
  return { admin: admin.address, operator: operator.address }
}

async function constructorArgs(): Promise<[AztecAddress, AztecAddress, number, number]> {
  const { admin, operator } = await localNetworkRegistryAccounts()
  return [admin, operator, MODE_VALID_WITHIN_WINDOW, LOCAL_NETWORK_REGISTRY_VALIDITY_WINDOW]
}
