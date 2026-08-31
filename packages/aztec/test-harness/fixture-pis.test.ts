// zkpassport_core's parse tests pin FIXTURE_PIS, a hand-transcribed copy of the public
// inputs from fixtures/outer_count_4_age.json. This test keeps the transcription honest:
// if the fixture is ever regenerated, the Noir constant must be retranscribed or the parse
// tests silently keep exercising a transcript no real proof carries.
//
// Run from the repo root: `bun test packages/aztec/test-harness/fixture-pis.test.ts`
import { expect, test } from "bun:test"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import fixture from "./fixtures/outer_count_4_age.json"

const PARSE_NR = fileURLToPath(
  new URL("../zkpassport.nr/zkpassport_core/src/parse.nr", import.meta.url),
)

test("FIXTURE_PIS matches the age fixture's public inputs", () => {
  const src = readFileSync(PARSE_NR, "utf8")
  const body = src.match(/FIXTURE_PIS: \[Field; 9\] = \[([\s\S]*?)\n\s*\];/)?.[1]
  expect(body).toBeDefined()
  const pis = [...body!.matchAll(/0x[0-9a-fA-F]+/g)].map((m) => BigInt(m[0]))
  expect(pis).toHaveLength(9)
  expect(pis).toEqual(fixture.publicInputs.map((pi: string) => BigInt(pi)))
})
