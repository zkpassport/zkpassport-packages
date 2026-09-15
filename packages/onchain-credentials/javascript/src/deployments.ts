import type { Chain } from "viem"
import { anvil, sepolia } from "viem/chains"
import type { SupportedChain } from "@zkpassport/utils"

/**
 * Canonical credentials deployments: the chains credentials run on and,
 * where one is deployed, the ZKPassportCredentials registry address.
 */
const CREDENTIALS_DEPLOYMENTS: Partial<
  Record<SupportedChain, { chain: Chain; registry?: `0x${string}` }>
> = {
  ethereum_sepolia: { chain: sepolia, registry: "0x3278117D873965036B5e0007112ADDd488Bde3e1" },
  local: { chain: anvil },
}

export function getCredentialsChain(chain: SupportedChain): Chain {
  const deployment = CREDENTIALS_DEPLOYMENTS[chain]
  if (!deployment) {
    throw new Error(`Credential minting is not supported on '${chain}' yet.`)
  }
  return deployment.chain
}

export function getCredentialsRegistry(chain: SupportedChain): `0x${string}` {
  const registry = CREDENTIALS_DEPLOYMENTS[chain]?.registry
  if (!registry) {
    throw new Error(`Credential minting is not supported on '${chain}': no registry is deployed.`)
  }
  return registry
}
