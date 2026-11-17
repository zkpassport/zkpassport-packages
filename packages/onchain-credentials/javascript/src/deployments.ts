import type { Chain } from "viem"
import { anvil, base, mainnet, robinhood, sepolia } from "viem/chains"
import type { SupportedChain } from "@zkpassport/utils"

/**
 * Canonical credentials deployments: the chains credentials run on and,
 * where one is deployed, the ZKPassportCredentials contract address.
 */
const CREDENTIALS_DEPLOYMENTS: Partial<
  Record<SupportedChain, { chain: Chain; address?: `0x${string}` }>
> = {
  ethereum: { chain: mainnet, address: "0x000C8Dbf0F3855D66f346bD969e659D93f744E4b" },
  base: { chain: base, address: "0x000C8Dbf0F3855D66f346bD969e659D93f744E4b" },
  robinhood: { chain: robinhood, address: "0x000C8Dbf0F3855D66f346bD969e659D93f744E4b" },
  ethereum_sepolia: { chain: sepolia, address: "0x000C8Dbf0F3855D66f346bD969e659D93f744E4b" },
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
