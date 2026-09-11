import type { Chain } from "viem"
import { anvil, sepolia } from "viem/chains"
import type { SupportedChain } from "@zkpassport/utils"

/**
 * Canonical attest deployments: the chains attest runs on and, where one is
 * deployed, the ZKPassportCredentials registry address. Deploy records live
 * in packages/attest-contracts/deployments/; record new deployments here too.
 * `local` ships chain config only — dev setups add the registry address of
 * their own deployment.
 */
const ATTEST_DEPLOYMENTS: Partial<
  Record<SupportedChain, { chain: Chain; registry?: `0x${string}` }>
> = {
  ethereum_sepolia: { chain: sepolia, registry: "0x3278117D873965036B5e0007112ADDd488Bde3e1" },
  local: { chain: anvil },
}

export function getAttestChain(chain: SupportedChain): Chain {
  const deployment = ATTEST_DEPLOYMENTS[chain]
  if (!deployment) {
    throw new Error(`Attestation minting is not supported on '${chain}' yet.`)
  }
  return deployment.chain
}

export function getAttestRegistry(chain: SupportedChain): `0x${string}` {
  const registry = ATTEST_DEPLOYMENTS[chain]?.registry
  if (!registry) {
    throw new Error(`Attestation minting is not supported on '${chain}': no registry is deployed.`)
  }
  return registry
}
