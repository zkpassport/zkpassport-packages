import assert from "node:assert/strict"
import { test } from "node:test"

import { AztecAddress } from "@aztec-labs/aztec.js/addresses"

import {
  assembleDiscloseCapsule,
  assembleProofCapsule,
  assembleSanctionsCapsule,
  toAztecCapsules,
} from "../src/capsule.ts"
import { outerCapsuleLength, PROOF_CAPSULE_SLOT, SANCTIONS_CAPSULE_SLOT } from "../src/constants.ts"

const parts = {
  vk: Array(115).fill("01"),
  proof: Array(458).fill("02"),
  publicInputs: Array(10).fill("11"),
}

test("assembles the 583-field outer_count_5 blob, reading bare SDK output as hex", () => {
  const blob = assembleProofCapsule(parts)

  assert.equal(blob.length, outerCapsuleLength(5))
  assert.equal(blob[blob.length - 1].toBigInt(), 0x11n)
})

test("assembles the disclose and sanctions capsules as fields", () => {
  assert.equal(assembleDiscloseCapsule(Array(90).fill(0), Array(90).fill(1)).length, 180)
  assert.deepEqual(
    assembleSanctionsCapsule("0x2a5a").map((field) => field.toBigInt()),
    [0x2a5an],
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
