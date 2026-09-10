import type { SupportedChain } from "@zkpassport/sdk"

/**
 * Canonical ZKPassportCredentials registry per chain; the button resolves the
 * registry from `chain` alone. Deploy records live in
 * packages/attest-contracts/deployments/ — record new deployments here too.
 */
const ATTEST_REGISTRIES: Partial<Record<SupportedChain, `0x${string}`>> = {
  ethereum_sepolia: "0x2a615a175439b9eb0004b924aBdD2B4c7a871f11",
}

export function getAttestRegistry(chain: SupportedChain): `0x${string}` {
  const address = ATTEST_REGISTRIES[chain]
  if (!address) {
    throw new Error(`Attestation minting is not supported on '${chain}': no registry is deployed.`)
  }
  return address
}
