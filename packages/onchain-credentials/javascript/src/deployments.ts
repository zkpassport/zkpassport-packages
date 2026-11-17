import type { Chain } from "viem"
import { anvil, base, mainnet, robinhood, sepolia } from "viem/chains"
import type { SupportedChain } from "@zkpassport/utils"

type CredentialsContract = {
  address: `0x${string}`
  deployBlock: bigint
}

/**
 * Canonical credentials deployments: the chains credentials run on and,
 * where one is deployed, the ZKPassportCredentials contract.
 */
const CREDENTIALS_DEPLOYMENTS: Partial<
  Record<SupportedChain, { chain: Chain; contract?: CredentialsContract }>
> = {
  ethereum: {
    chain: mainnet,
    contract: { address: "0x000C8Dbf0F3855D66f346bD969e659D93f744E4b", deployBlock: 26428042n },
  },
  base: {
    chain: base,
    contract: { address: "0x000C8Dbf0F3855D66f346bD969e659D93f744E4b", deployBlock: 58237426n },
  },
  robinhood: {
    chain: robinhood,
    contract: { address: "0x000C8Dbf0F3855D66f346bD969e659D93f744E4b", deployBlock: 115822367n },
  },
  ethereum_sepolia: {
    chain: sepolia,
    contract: { address: "0x000C8Dbf0F3855D66f346bD969e659D93f744E4b", deployBlock: 12147616n },
  },
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
  return getCredentialsContract(chain).address
}

export function getCredentialsDeployBlock(chain: SupportedChain): bigint {
  return getCredentialsContract(chain).deployBlock
}

function getCredentialsContract(chain: SupportedChain): CredentialsContract {
  const contract = CREDENTIALS_DEPLOYMENTS[chain]?.contract
  if (!contract) {
    throw new Error(
      `Credential minting is not supported on '${chain}': no credentials contract is deployed.`,
    )
  }
  return contract
}
