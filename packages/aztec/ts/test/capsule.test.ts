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
  publicInputs: Array(11).fill("11"),
  version: "0.23.0",
}

test("assembles the 585-field outer_count_5 blob, reading bare SDK output as hex", () => {
  const blob = assembleProofCapsule(parts)

  assert.equal(blob.length, outerCapsuleLength(5))
  assert.equal(blob.length, 585)
  // "11" is valid decimal and valid hex: the field must be 0x11
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

test("assembles the disclose and sanctions capsules as fields", () => {
  assert.equal(assembleDiscloseCapsule(Array(90).fill(0), Array(90).fill(1)).length, 180)
  assert.throws(() => assembleDiscloseCapsule(Array(89).fill(0), Array(90).fill(0)), /mask 89\/90/)
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
