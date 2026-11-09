/**
 * The dev registry: a ZKPassport registry for tests, at the same address in TXE and on an Aztec
 * local network, where `verify_zkpassport_proof` finds it.
 *
 * Note: this is a TS mirror of `noir/verifier/src/dev_registry.nr`. That is the source of truth.
 */
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { Contract } from "@aztec-labs/aztec.js/contracts"
import { Fr } from "@aztec-labs/aztec.js/fields"
import type { Wallet } from "@aztec-labs/aztec.js/wallet"

import { ZKPassportRegistryArtifact } from "./artifact.ts"

/** The dev registry's address in TXE and on a local network. */
export const DEV_REGISTRY_ADDRESS = AztecAddress.fromStringUnsafe(
  "0x0a8d7ec68d16d4bdc05ff6dfd0ac0964392ac70c41c8c76bbc9ee605da0167cf",
)

/** The salt the dev registry is deployed with: `sha256_to_field("ZKPASSPORT::AZTEC::DEV_REGISTRY")`. */
export const DEV_REGISTRY_SALT = Fr.fromHexString(
  "0x00ada35ec664fc11bd5f1210cb27590667ef2a1a58a473d9d6a9f3cc7bf84043",
)

/** The dev registry's root validity window, in seconds. */
export const DEV_REGISTRY_VALIDITY_WINDOW = 86400

/** The dev registry's admin: the local network's test account 0. */
export const DEV_REGISTRY_ADMIN = AztecAddress.fromStringUnsafe(
  "0x0e900d357d0a7b9de3c0293c6b1a58dccfc1862f31c745ba5d3a5a5aaf4ac1fd",
)

/** The dev registry's operator: the local network's test account 1. */
export const DEV_REGISTRY_OPERATOR = AztecAddress.fromStringUnsafe(
  "0x3029dfcca99e1f1fc1b9c88aa32de4eec686e79a0103a780ded503402aca3d08",
)

// Mirrors of the registry's MODE_VALID_WITHIN_WINDOW, REGISTRY_CERTIFICATE and REGISTRY_CIRCUIT
const MODE_VALID_WITHIN_WINDOW = 3
const REGISTRY_CERTIFICATE = 1n
const REGISTRY_CIRCUIT = 2n

/** The constructor arguments the dev registry is deployed with. */
export const DEV_REGISTRY_CONSTRUCTOR_ARGS = [
  DEV_REGISTRY_ADMIN,
  DEV_REGISTRY_OPERATOR,
  MODE_VALID_WITHIN_WINDOW,
  DEV_REGISTRY_VALIDITY_WINDOW,
] as const

/** What `seedDevRegistry` registers. */
export interface DevRegistrySeed {
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
 * Deploys the dev registry on a local network.
 *
 * The wallet must hold the local network's test account 0, which sends the deployment, e.g. through
 * `registerInitialLocalNetworkAccountsInWallet`.
 */
export async function deployDevRegistry(wallet: Wallet): Promise<Contract> {
  const { contract } = await Contract.deploy(
    wallet,
    ZKPassportRegistryArtifact,
    [...DEV_REGISTRY_CONSTRUCTOR_ARGS],
    "constructor",
    { salt: DEV_REGISTRY_SALT, universalDeploy: true },
  ).send({ from: DEV_REGISTRY_ADMIN })
  if (!contract.address.equals(DEV_REGISTRY_ADDRESS)) {
    throw new Error(
      `the registry artifact deployed at ${contract.address.toString()}, not at DEV_REGISTRY_ADDRESS`,
    )
  }
  return contract
}

/**
 * Registers a certificate root and a circuit root in the dev registry, and accepts a vk hash for a
 * circuit-manifest version.
 *
 * The wallet must hold the local network's test accounts 0 and 1. The registry applies these after
 * its delay: advance the network's time past it, and into the freshness window of the proof being
 * verified, before verifying.
 */
export async function seedDevRegistry(wallet: Wallet, seed: DevRegistrySeed): Promise<void> {
  const registry = Contract.at(DEV_REGISTRY_ADDRESS, ZKPassportRegistryArtifact, wallet)
  await registry.methods
    .update_root(REGISTRY_CERTIFICATE, seed.certificateRoot, 0n, seed.validFrom)
    .send({ from: DEV_REGISTRY_OPERATOR })
  await registry.methods
    .update_root(REGISTRY_CIRCUIT, seed.circuitRoot, 0n, seed.validFrom)
    .send({ from: DEV_REGISTRY_OPERATOR })
  await registry.methods
    .add_accepted_vk(seed.version, seed.vkHash)
    .send({ from: DEV_REGISTRY_ADMIN })
  await registry.methods.set_version_status(seed.version, true).send({ from: DEV_REGISTRY_ADMIN })
}
