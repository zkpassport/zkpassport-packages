// Simulates each function's tx and prices its gas at the node's current minimum fees.
//
// Usage: tsx gas.ts <bench_fn>...
import { Contract } from "@aztec-labs/aztec.js/contracts"
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node"
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded"
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec-labs/wallets/testing"
import { appendFileSync } from "fs"

import { ARTIFACTS, type Bench, benchInputs, NODE_URL, readDeployment } from "./common.ts"

const node = createAztecNodeClient(NODE_URL)
const wallet = await EmbeddedWallet.create(node, { ephemeral: true, pxe: { proverEnabled: false } })
const [from] = await registerInitialLocalNetworkAccountsInWallet(wallet)
const deployment = readDeployment()
for (const name of Object.keys(ARTIFACTS) as (keyof typeof ARTIFACTS)[]) {
  await wallet.registerContract((await node.getContract(deployment[name]))!, ARTIFACTS[name])
}
const contract = Contract.at(deployment.test, ARTIFACTS.test, wallet)
const fees = await node.getCurrentMinFees()

for (const fn of process.argv.slice(2) as Bench[]) {
  const { args, capsules } = benchInputs(fn, deployment, from)
  const { gasUsed } = await contract.methods[fn](...args).simulate({ from, capsules, includeMetadata: true })
  const g = gasUsed!.billedGas ?? gasUsed!.totalGas
  const fee = BigInt(g.daGas) * fees.feePerDaGas + BigInt(g.l2Gas) * fees.feePerL2Gas
  const row = {
    fn,
    daGas: g.daGas,
    l2Gas: g.l2Gas,
    feePerDaGas: fees.feePerDaGas.toString(),
    feePerL2Gas: fees.feePerL2Gas.toString(),
    feeJuice: fee.toString(),
    gasUsed: JSON.parse(JSON.stringify(gasUsed)),
  }
  console.log(JSON.stringify(row))
  appendFileSync(new URL("./gas.jsonl", import.meta.url), JSON.stringify(row) + "\n")
}
process.exit(0)
