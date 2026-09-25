/**
 * PROTOTYPE — throwaway spike, not for merge. Step 1 of 2 (step 2: prototype-bridge.ts).
 *
 * Question: do proofs generated in Node with bb.js 5.0.0, against the published 0.21.0
 * circuits, pass the SDK's verify({ devMode: true, verifierMode: "local" })?
 *
 * Passport: john (ZKR mock issuer), SOD copied from zkpassport-mobile-app assets/mock-data. Fast mode, no bridge.
 * Query: age >= 18 + nationality disclose → 5 proofs (DSC, ID data, integrity, compare_age,
 * disclose_bytes). Registry: Sepolia, which is what devMode reads and where the ZKR CSCAs live.
 * Proving lives in prototype-prove.ts.
 *
 * Run from the repo root: bun packages/zkpassport-sdk/scripts/prototype-node-proofs.ts
 */
import type { Query } from "@zkpassport/utils"
import { ZKPassport } from "../src/index"
import { log, proveJohnFastMode } from "./prototype-prove"

const DOMAIN = "localhost"
const QUERY: Query = { age: { gte: 18 }, nationality: { disclose: true } }
const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2)

async function main() {
  const { proofs, queryResult } = await proveJohnFastMode({
    domain: DOMAIN,
    query: QUERY,
    devMode: true,
  })
  const zkPassport = new ZKPassport(DOMAIN)

  log("SDK verify() on the 5 proofs")
  const result = await zkPassport.verify({
    proofs,
    originalQuery: QUERY,
    queryResult,
    devMode: true,
    verifierMode: "local",
  })
  log("result:", json(result))

  // Negative control: flip one byte in the body of the disclose proof (after its public inputs).
  // Select by name: verify() sorts the caller's proofs array in place (public-input-checker.ts:2359).
  const tampered = proofs.map((p) => ({ ...p }))
  const target = tampered.find((p) => p.name === "disclose_bytes")!
  const hex = target.proof as string
  const at = hex.length - 200
  const flipped = ((parseInt(hex.slice(at, at + 2), 16) ^ 0xff) & 0xff)
    .toString(16)
    .padStart(2, "0")
  target.proof = hex.slice(0, at) + flipped + hex.slice(at + 2)
  log("SDK verify() with one byte of the disclose proof flipped (expect verified: false)")
  const tamperedResult = await zkPassport.verify({
    proofs: tampered,
    originalQuery: QUERY,
    queryResult,
    devMode: true,
    verifierMode: "local",
  })
  log("tampered result:", json(tamperedResult))

  log(
    result.verified && !tamperedResult.verified
      ? "ANSWER: yes — Node-made proofs pass, and tampering is caught"
      : "ANSWER: no — see results above",
  )
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
