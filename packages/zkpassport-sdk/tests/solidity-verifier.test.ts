import { describe, expect, test } from "bun:test"
import type { ProofResult } from "@zkpassport/utils"
import { SolidityVerifier } from "../src/solidity-verifier"

describe("SolidityVerifier.getParameters", () => {
  test("builds the verify parameters of an outer EVM proof", () => {
    const publicInputFields = "aa".repeat(32 * 8)
    const proofFields = "bb".repeat(32 * 12)
    const proof: ProofResult = {
      name: "outer_evm_3",
      version: "0.21.1",
      vkeyHash: "0x1234",
      proof: publicInputFields + proofFields,
    }

    const params = SolidityVerifier.getParameters({
      proof,
      validityPeriodInSeconds: 3600,
      domain: "example.com",
      scope: "test-scope",
      devMode: true,
    })

    expect(params).toEqual({
      version: "0x0000001500010000000000000000000000000000000000000000000000000000",
      proofVerificationData: {
        vkeyHash: `0x${"0".repeat(60)}1234`,
        proof: `0x${proofFields}`,
        publicInputs: Array(8).fill(`0x${"aa".repeat(32)}`),
      },
      committedInputs: "0x",
      serviceConfig: {
        validityPeriodInSeconds: 3600,
        domain: "example.com",
        scope: "test-scope",
        devMode: true,
        allowedCredentials: [],
      },
    })
  })
})
