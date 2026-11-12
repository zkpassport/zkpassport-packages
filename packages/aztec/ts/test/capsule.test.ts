import assert from "node:assert/strict"
import { test } from "node:test"

import {
  assembleDiscloseCapsule,
  assembleFacematchCapsule,
  assembleProofCapsule,
  assembleSanctionsCapsule,
} from "../src/capsule.ts"
import { outerCapsuleLength } from "../src/constants.ts"

const parts = {
  vk: Array(115).fill("01"),
  proof: Array(458).fill("02"),
  publicInputs: Array(10).fill("11"),
}

test("assembles the 583-field outer_count_5 blob", () => {
  const blob = assembleProofCapsule(parts)
  assert.equal(blob.length, outerCapsuleLength(5))
  assert.equal(blob.length, 583)
})

test("parses bare SDK output as hex, never decimal", () => {
  // "11" is valid decimal AND valid hex — the assembled field must be 0x11.
  const blob = assembleProofCapsule(parts)
  assert.equal(blob[blob.length - 1].toBigInt(), 0x11n)
})

test("rejects a wrong-shaped proof with the actual counts", () => {
  assert.throws(
    () => assembleProofCapsule({ ...parts, publicInputs: Array(9).fill("11") }),
    /public inputs 9\/10/,
  )
  assert.throws(() => assembleProofCapsule({ ...parts, vk: Array(114).fill("01") }), /vk 114\/115/)
})

test("assembles and shape-checks the disclose preimage", () => {
  const mask = Array(90).fill(0)
  const bytes = Array(90).fill(0)
  assert.equal(assembleDiscloseCapsule(mask, bytes).length, 180)
  assert.throws(() => assembleDiscloseCapsule(mask.slice(1), bytes), /mask 89\/90/)
})

test("assembles the face match capsule in the circuits' encoding", () => {
  const capsule = assembleFacematchCapsule({
    rootKeyLeaf: "0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b",
    environment: "production",
    appIdHash: "0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b",
    integrityPubkeyHash: "0x00",
    mode: "strict",
  })

  assert.deepEqual(
    capsule.map((field) => field.toBigInt()),
    [
      0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340bn,
      1n,
      0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179bn,
      0n,
      2n,
    ],
  )
})

test("assembles the sanctions capsule from the SDK's sanctions root", () => {
  assert.deepEqual(
    assembleSanctionsCapsule("0x2a5a").map((field) => field.toBigInt()),
    [0x2a5an],
  )
})
