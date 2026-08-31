// fixtures.nr must mirror the conformance vectors published by @zkpassport/utils
// (conformance/vectors.json), the shared reference for every implementation of the
// parameter-commitment scheme. The SDK is held to the vectors by its own test suite
// (packages/zkpassport-utils/tests/conformance.test.ts); this test holds the Noir anchors to
// the same file, parsed out of the Noir source at test time so no copy can go stale.
//
// Run from the repo root: `bun test packages/aztec/test-harness/commitment-conformance.test.ts`
import { expect, test } from "bun:test"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import vectors from "../../zkpassport-utils/conformance/vectors.json"
import { evaluateExpressions, parseNoirFile } from "./vendor/constants-generator"

const FIXTURES_NR = fileURLToPath(
  new URL("../zkpassport.nr/zkpassport_core/src/fixtures.nr", import.meta.url),
)
// name => decimal string
const anchors = evaluateExpressions(
  parseNoirFile(readFileSync(FIXTURES_NR, "utf8")).constantsExpressions,
)
const hex = (name: string): string => "0x" + BigInt(anchors[name]).toString(16).padStart(64, "0")
const vector = (proofType: string) => vectors.vectors.find((v) => v.proofType === proofType)!

test("every anchor in fixtures.nr is checked here", () => {
  expect(Object.keys(anchors).sort()).toEqual(["AGE_18_COMMITMENT", "DISCLOSE_COMMITMENT"])
})

test("AGE_18_COMMITMENT matches the published age vector", () => {
  expect(hex("AGE_18_COMMITMENT")).toBe(vector("age").commitment)
})

test("DISCLOSE_COMMITMENT matches the published disclose vector", () => {
  expect(hex("DISCLOSE_COMMITMENT")).toBe(vector("disclose").commitment)
})
