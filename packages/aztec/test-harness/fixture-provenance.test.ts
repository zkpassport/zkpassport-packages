// The proof fixtures are self-consistent (each proof verifies against its own embedded vk,
// and the TXE tests seed registries from the fixture's own roots), so a circuits bump that
// changes the circuit without changing formats keeps everything green while testing the
// PREVIOUS release. This test closes that hole: each fixture must have been generated from
// the exact circuits commit the submodule pins, and both fixtures must share one outer vk.
//
// Run from the repo root: `bun test packages/aztec/test-harness/fixture-provenance.test.ts`
import { expect, test } from "bun:test"
import { execSync } from "child_process"
import age from "./fixtures/outer_count_4_age.json"
import disclose from "./fixtures/outer_count_4_disclose.json"

// The gitlink recorded in the tree ("160000 commit <sha>\tpath"), not the submodule checkout,
// so this works without `git submodule update`.
const pinnedCommit = execSync("git ls-tree HEAD packages/aztec/test-harness/circuits", {
  cwd: new URL("../../..", import.meta.url).pathname,
})
  .toString()
  .split(/\s+/)[2]

test("fixtures were generated from the pinned circuits commit", () => {
  expect(pinnedCommit).toMatch(/^[0-9a-f]{40}$/)
  expect(age.circuitsCommit).toBe(pinnedCommit)
  expect(disclose.circuitsCommit).toBe(pinnedCommit)
})

test("both fixtures carry the same outer-circuit vk", () => {
  expect(age.vkeyHashBB).toBe(disclose.vkeyHashBB)
  expect(age.vkeyFields).toEqual(disclose.vkeyFields)
})
