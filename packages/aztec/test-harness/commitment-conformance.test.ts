// Cross-implementation conformance: @zkpassport/utils must reproduce the commitment
// anchors pinned in zkpassport_core/src/fixtures.nr — the same anchors the Noir tests in
// zkpassport_core hold the circuits-repo libs to. The anchors are parsed out of the Noir
// source at test time, so there is no generated copy to go stale.
//
// Run from the repo root:
//
// `bun i && bun run --cwd packages/zkpassport-utils build`
//
// then:
//
// `bun test packages/aztec/test-harness/commitment-conformance.test.ts`
import { expect, test } from "bun:test"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { evaluateExpressions, parseNoirFile } from "./vendor/constants-generator"
import {
  getAgeParameterCommitment,
  getDiscloseParameterCommitment,
} from "../../zkpassport-utils/dist/esm/index.js"

const FIXTURES_NR = fileURLToPath(
  new URL("../zkpassport.nr/zkpassport_core/src/fixtures.nr", import.meta.url),
)
// name => decimal string
const anchors = evaluateExpressions(
  parseNoirFile(readFileSync(FIXTURES_NR, "utf8")).constantsExpressions,
)
const anchor = (name: string): bigint => BigInt(anchors[name])

test("every anchor in fixtures.nr is checked here", () => {
  expect(Object.keys(anchors).sort()).toEqual(["AGE_18_COMMITMENT", "DISCLOSE_COMMITMENT"])
})

test("age(18+, no max) matches AGE_18_COMMITMENT", async () => {
  expect(await getAgeParameterCommitment(18, 0)).toBe(anchor("AGE_18_COMMITMENT"))
})

test('disclose(nationality-only TD3 mask, "AUS") matches DISCLOSE_COMMITMENT', async () => {
  const mask = Array(90).fill(0)
  const disclosed = Array(90).fill(0)
  const aus = [65, 85, 83]
  for (let i = 0; i < 3; i++) {
    mask[54 + i] = 1
    disclosed[54 + i] = aus[i]
  }
  expect(await getDiscloseParameterCommitment(mask, disclosed)).toBe(anchor("DISCLOSE_COMMITMENT"))
})
