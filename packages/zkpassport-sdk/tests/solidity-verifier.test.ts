import { describe, expect, test } from "bun:test"
import type { ProofResult } from "@zkpassport/utils"
import { SolidityVerifier } from "../src/solidity-verifier"

describe("SolidityVerifier.getParameters", () => {
  test("sets version to the RootVerifier key of the proof's circuits version", () => {
    const proof: ProofResult = {
      name: "outer_evm_3",
      version: "0.21.1",
      vkeyHash: "0x01",
      proof: "00".repeat(32 * 20),
    }

    const params = SolidityVerifier.getParameters({ proof, domain: "example.com" })

    expect(params.version).toBe(
      "0x0000001500010000000000000000000000000000000000000000000000000000",
    )
  })
})
