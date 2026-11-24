import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assembleDiscloseCapsule,
  assembleProofCapsule,
  assembleSanctionsCapsule,
} from "../src/capsule.ts"
import { outerCapsuleLength } from "../src/constants.ts"

const parts = {
  vk: Array(115).fill("01"),
  proof: Array(458).fill("02"),
  publicInputs: Array(11).fill("11"),
  version: "0.23.0",
}

test("assembles the 585-field outer_count_5 blob", () => {
  const blob = assembleProofCapsule(parts)
  assert.equal(blob.length, outerCapsuleLength(5))
  assert.equal(blob.length, 585)
})

test("parses bare SDK output as hex, never decimal", () => {
  // "11" is valid decimal AND valid hex — the assembled field must be 0x11.
  const blob = assembleProofCapsule(parts)
  assert.equal(blob[blob.length - 2].toBigInt(), 0x11n)
})

test("ends the blob with the circuits release, packed as the registry keys vks", () => {
  const blob = assembleProofCapsule({ ...parts, version: "0.23.4" })
  assert.equal(blob[blob.length - 1].toBigInt(), (23n << 224n) | (4n << 208n))
})

test("rejects a proof of a circuits release the library does not parse", () => {
  assert.throws(() => assembleProofCapsule({ ...parts, version: "0.22.0" }), /0\.23\.x/)
  assert.throws(() => assembleProofCapsule({ ...parts, version: "0.24.0" }), /0\.23\.x/)
})

test("rejects a wrong-shaped proof with the actual counts", () => {
  assert.throws(
    () => assembleProofCapsule({ ...parts, publicInputs: Array(10).fill("11") }),
    /public inputs 10\/11/,
  )
  assert.throws(() => assembleProofCapsule({ ...parts, vk: Array(114).fill("01") }), /vk 114\/115/)
})

test("assembles and shape-checks the disclose preimage", () => {
  const mask = Array(90).fill(0)
  const bytes = Array(90).fill(0)
  assert.equal(assembleDiscloseCapsule(mask, bytes).length, 180)
  assert.throws(() => assembleDiscloseCapsule(mask.slice(1), bytes), /mask 89\/90/)
})

test("assembles the sanctions capsule from the SDK's sanctions root", () => {
  assert.deepEqual(
    assembleSanctionsCapsule("0x2a5a").map((field) => field.toBigInt()),
    [0x2a5an],
  )
})
