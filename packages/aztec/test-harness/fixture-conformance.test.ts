// This test pins the fixtures we use to test zkpassport.nr to their external references:
// the commitment anchors in fixtures.nr to the SDK's conformance vectors, FIXTURE_PIS to the
// public inputs of the checked-in age proof fixture, and the proof fixtures themselves to the
// circuits submodule commit they were generated from. The provenance check matters because
// the proof fixtures are self-consistent (each proof verifies against its own embedded vk),
// so a circuits bump without regeneration would silently keep testing the previous release.
//
// Run from the repo root: `bun test packages/aztec/test-harness/fixture-conformance.test.ts`
import { expect, test } from "bun:test"
import { execSync } from "child_process"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import vectors from "../../zkpassport-utils/conformance/vectors.json"
import ageFixture from "./fixtures/outer_count_4_age.json"
import discloseFixture from "./fixtures/outer_count_4_disclose.json"
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

test("proof fixtures were generated from the pinned circuits commit", () => {
  // The gitlink recorded in the tree ("160000 commit <sha>\tpath"), not the submodule
  // checkout, so this works without `git submodule update`.
  const pinnedCommit = execSync("git ls-tree HEAD packages/aztec/test-harness/circuits", {
    cwd: new URL("../../..", import.meta.url).pathname,
  })
    .toString()
    .split(/\s+/)[2]
  expect(pinnedCommit).toMatch(/^[0-9a-f]{40}$/)
  expect(ageFixture.circuitsCommit).toBe(pinnedCommit)
  expect(discloseFixture.circuitsCommit).toBe(pinnedCommit)
})

test("both proof fixtures carry the same outer-circuit vk", () => {
  expect(ageFixture.vkeyHashBB).toBe(discloseFixture.vkeyHashBB)
  expect(ageFixture.vkeyFields).toEqual(discloseFixture.vkeyFields)
})
