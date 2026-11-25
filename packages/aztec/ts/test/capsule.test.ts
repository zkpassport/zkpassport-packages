import assert from "node:assert/strict"
import { test } from "node:test"

import { AztecAddress } from "@aztec-labs/aztec.js/addresses"

import {
  assembleDiscloseCapsule,
  assembleFacematchCapsule,
  assembleProofCapsule,
  assembleSanctionsCapsule,
  toAztecCapsules,
} from "../src/capsule.ts"
import {
  FACE_MATCH_CAPSULE_SLOT,
  outerCapsuleLength,
  PROOF_CAPSULE_SLOT,
  SANCTIONS_CAPSULE_SLOT,
} from "../src/constants.ts"

const parts = {
  vk: Array(115).fill("01"),
  proof: Array(458).fill("02"),
  publicInputs: Array(11).fill("11"),
  version: "0.23.0",
}

// The layouts and their shape checks are @zkpassport/utils' and tested there; these tests cover
// what the adapters add: Fr fields, and the proof count passed through.
test("assembles the 585-field outer_count_5 blob, reading bare SDK output as hex", () => {
  const blob = assembleProofCapsule(parts)

  assert.equal(blob.length, outerCapsuleLength(5))
  assert.equal(blob.length, 585)
  // "11" is valid decimal and valid hex: the field must be 0x11
  assert.equal(blob[blob.length - 2].toBigInt(), 0x11n)
})

test("assembles the blob of the outer_count it is given", () => {
  const blob = assembleProofCapsule({ ...parts, publicInputs: Array(9).fill("11") }, 3)
  assert.equal(blob.length, outerCapsuleLength(3))
})

test("assembles the disclose and sanctions capsules as fields", () => {
  assert.equal(assembleDiscloseCapsule(Array(90).fill(0), Array(90).fill(1)).length, 180)
  assert.deepEqual(
    assembleSanctionsCapsule("0x2a5a").map((field) => field.toBigInt()),
    [0x2a5an],
  )
})

test("assembles a face match's parameters, in the order its proof commits them, for slot 4", () => {
  const appleRootKey = 0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340bn
  const iosAppId = 0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179bn

  const capsule = assembleFacematchCapsule({
    rootKeyLeaf: `0x${appleRootKey.toString(16)}`,
    environment: "production",
    appIdHash: `0x${iosAppId.toString(16)}`,
    integrityPubkeyHash: "0x00",
    mode: "strict",
  })

  assert.equal(FACE_MATCH_CAPSULE_SLOT, 4n)
  assert.deepEqual(
    capsule.map((field) => field.toBigInt()),
    [appleRootKey, 1n, iosAppId, 0n, 2n, 0n],
  )
})

test("turns verifier parameters into capsules for the contract, scoped to the sender", () => {
  const contract = AztecAddress.fromBigIntUnsafe(0x1234n)
  const sender = AztecAddress.fromBigIntUnsafe(0x5678n)

  const capsules = toAztecCapsules(
    {
      capsules: [
        { slot: Number(PROOF_CAPSULE_SLOT), fields: ["0x01", "0x02"] },
        { slot: Number(SANCTIONS_CAPSULE_SLOT), fields: ["0x2a5a"] },
      ],
    },
    contract,
    sender,
  )

  assert.deepEqual(
    capsules.map((capsule) => ({
      contract: capsule.contractAddress.toString(),
      slot: capsule.storageSlot.toBigInt(),
      data: capsule.data.map((field) => field.toBigInt()),
      scope: capsule.scope?.toString(),
    })),
    [
      { contract: contract.toString(), slot: 1n, data: [1n, 2n], scope: sender.toString() },
      { contract: contract.toString(), slot: 3n, data: [0x2a5an], scope: sender.toString() },
    ],
  )
})
