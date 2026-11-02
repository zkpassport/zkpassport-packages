import { afterEach, describe, expect, test } from "bun:test"
import type { PackagedCircuit, ProofResult } from "@zkpassport/utils"
import { BBVerifier } from "./bb-verifier"
import compareAge from "./fixtures/compare-age-0.21.1.json"

// A compare_age proof from the published 0.21.1 circuits, which are built with bb 5.0.0
const proof = compareAge.proof as ProofResult

function compareAgeCircuit(bbVersion: string): PackagedCircuit {
  return {
    name: "compare_age",
    noir_version: "",
    bb_version: bbVersion,
    size: 0,
    abi: {
      parameters: [],
      param_witnesses: {},
      return_type: null,
      return_witnesses: [],
      error_types: {},
    },
    bytecode: "",
    vkey: compareAge.vkey,
    vkey_hash: compareAge.proof.vkeyHash,
    hash: 0,
  }
}

describe("BBVerifier", () => {
  let verifier: BBVerifier

  afterEach(() => verifier.destroy())

  test("verifies a proof with the bundled bb.js of its packaged circuit's bb version", async () => {
    verifier = new BBVerifier()

    expect(await verifier.verify(proof, compareAgeCircuit("5.0.0"))).toBe(true)
  }, 120_000)

  test("does not verify a proof whose packaged circuit has a bb version it does not bundle", async () => {
    verifier = new BBVerifier()

    for (const bbVersion of ["4.2.0-aztecnr-rc.2", "6.0.1", "7.0.0"]) {
      expect(await verifier.verify(proof, compareAgeCircuit(bbVersion))).toBe(false)
    }
  }, 120_000)
})
