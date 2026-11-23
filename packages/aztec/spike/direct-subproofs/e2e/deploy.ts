// Deploys the spike's contracts on the local network, without proving, and records their addresses.
import { Contract } from "@aztec-labs/aztec.js/contracts"
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node"
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec-labs/wallets/testing"
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded"
import { writeFileSync } from "fs"

import { ARTIFACTS, DEPLOYMENT, NODE_URL } from "./common.ts"

const node = createAztecNodeClient(NODE_URL)
const wallet = await EmbeddedWallet.create(node, { ephemeral: true, pxe: { proverEnabled: false } })
const [deployer] = await registerInitialLocalNetworkAccountsInWallet(wallet)
const addresses: Record<string, string> = {}
for (const [name, artifact] of Object.entries(ARTIFACTS)) {
  const { contract } = await Contract.deploy(wallet, artifact, []).send({ from: deployer, wait: { timeout: 600 } })
  addresses[name] = contract.address.toString()
  console.log(`${name} at ${contract.address}`)
}
writeFileSync(DEPLOYMENT, JSON.stringify(addresses, null, 2))
process.exit(0)
