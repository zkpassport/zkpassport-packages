// This test pins the Noir fixtures we use to test zkpassport.nr to their external references:
// the commitment anchors to the SDK's conformance vectors, and FIXTURE_PIS to the public
// inputs of the checked-in age proof fixture.
//
// Run from the repo root: `bun test packages/aztec/test-harness/fixture-conformance.test.ts`
import { expect, test } from "bun:test"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import vectors from "../../zkpassport-utils/conformance/vectors.json"
import ageFixture from "./fixtures/outer_count_4_age.json"
import { evaluateExpressions, parseNoirFile } from "./vendor/constants-generator"

const FIXTURES_NR = fileURLToPath(
  new URL("../zkpassport.nr/zkpassport_core/src/fixtures.nr", import.meta.url),
)
// name => decimal string (or an array of them, for array globals)
const anchors = evaluateExpressions(
  parseNoirFile(readFileSync(FIXTURES_NR, "utf8")).constantsExpressions,
)
const hex = (name: string): string => "0x" + BigInt(anchors[name] as string).toString(16).padStart(64, "0")
const vector = (proofType: string) => vectors.vectors.find((v) => v.proofType === proofType)!

test("every constant in fixtures.nr is checked here", () => {
  expect(Object.keys(anchors).sort()).toEqual([
    "AGE_18_COMMITMENT",
    "DISCLOSE_COMMITMENT",
    "FIXTURE_PIS",
  ])
})

test("AGE_18_COMMITMENT matches the published age vector", () => {
  expect(hex("AGE_18_COMMITMENT")).toBe(vector("age").commitment)
})

test("DISCLOSE_COMMITMENT matches the published disclose vector", () => {
  expect(hex("DISCLOSE_COMMITMENT")).toBe(vector("disclose").commitment)
})

test("FIXTURE_PIS matches the age fixture's public inputs", () => {
  const pis = anchors.FIXTURE_PIS
  expect(Array.isArray(pis)).toBe(true)
  expect(pis).toHaveLength(9)
  expect((pis as string[]).map(BigInt)).toEqual(
    ageFixture.publicInputs.map((pi: string) => BigInt(pi)),
  )
})
