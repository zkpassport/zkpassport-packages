import type { Chain } from "viem"
import { anvil, mainnet, sepolia } from "viem/chains"
import type { SupportedChain } from "@zkpassport/utils"

/**
 * Canonical credentials deployments: the chains credentials run on and,
 * where one is deployed, the ZKPassportCredentials contract address.
 */
const CREDENTIALS_DEPLOYMENTS: Partial<
  Record<SupportedChain, { chain: Chain; address?: `0x${string}` }>
> = {
  ethereum: { chain: mainnet, address: "0x0000C0DeeB514524CfcB8d0d3D0a801dC1F7153c" },
  ethereum_sepolia: { chain: sepolia, address: "0x0000C0DeeB514524CfcB8d0d3D0a801dC1F7153c" },
  local: { chain: anvil },
}

export function getCredentialsChain(chain: SupportedChain): Chain {
  const deployment = CREDENTIALS_DEPLOYMENTS[chain]
  if (!deployment) {
    throw new Error(`Credential minting is not supported on '${chain}' yet.`)
  }
  return deployment.chain
}

export function getCredentialsAddress(chain: SupportedChain): `0x${string}` {
  const address = CREDENTIALS_DEPLOYMENTS[chain]?.address
  if (!address) {
    throw new Error(
      `Credential minting is not supported on '${chain}': no credentials contract is deployed.`,
    )
  }
  return address
}
