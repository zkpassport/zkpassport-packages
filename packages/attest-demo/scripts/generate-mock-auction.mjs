// Regenerates lib/assets/mock-auction.ts from the attest-contracts forge build.
// Run from the repo root: bun packages/attest-demo/scripts/generate-mock-auction.mjs
import { execSync } from "node:child_process"
import fs from "node:fs"

const artifactPath = "packages/attest-contracts/out/MockAuction.sol/MockAuction.json"
if (!fs.existsSync(artifactPath)) {
  console.error(
    `${artifactPath} not found — run: cd packages/attest-contracts && forge build --skip test`,
  )
  process.exit(1)
}
const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"))
const commit = execSync(
  "git -C packages/attest-contracts log -1 --format=%h -- src/mocks/MockAuction.sol",
)
  .toString()
  .trim()
const out = `// Generated from packages/attest-contracts (commit ${commit}). Do not edit by hand.
// Source: forge build -> MockAuction.json -> .abi + .bytecode.object
// Regenerate: bun packages/attest-demo/scripts/generate-mock-auction.mjs
export const MockAuctionAbi = ${JSON.stringify(artifact.abi, null, 2)} as const

export const MockAuctionBytecode = ${JSON.stringify(artifact.bytecode.object)} as \`0x\${string}\`
`
fs.mkdirSync("packages/attest-demo/lib/assets", { recursive: true })
fs.writeFileSync("packages/attest-demo/lib/assets/mock-auction.ts", out)
console.log("wrote packages/attest-demo/lib/assets/mock-auction.ts")
