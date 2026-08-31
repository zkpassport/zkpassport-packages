// zkpassport_core's fixtures.nr pins FIXTURE_PIS, a hand-transcribed copy of the public
// inputs from fixtures/outer_count_4_age.json. This test keeps the transcription honest:
// if the fixture is ever regenerated, the Noir constant must be retranscribed or the parse
// tests silently keep exercising a transcript no real proof carries.
//
// Run from the repo root: `bun test packages/aztec/test-harness/fixture-pis.test.ts`
import { expect, test } from "bun:test"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import fixture from "./fixtures/outer_count_4_age.json"
import { evaluateExpressions, parseNoirFile } from "./vendor/constants-generator"

const FIXTURES_NR = fileURLToPath(
  new URL("../zkpassport.nr/zkpassport_core/src/fixtures.nr", import.meta.url),
)

test("FIXTURE_PIS matches the age fixture's public inputs", () => {
  const constants = evaluateExpressions(
    parseNoirFile(readFileSync(FIXTURES_NR, "utf8")).constantsExpressions,
  )
  const pis = constants.FIXTURE_PIS
  expect(Array.isArray(pis)).toBe(true)
  expect(pis).toHaveLength(9)
  expect((pis as string[]).map(BigInt)).toEqual(fixture.publicInputs.map((pi: string) => BigInt(pi)))
})
