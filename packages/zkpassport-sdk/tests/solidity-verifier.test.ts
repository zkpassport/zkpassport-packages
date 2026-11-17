import { describe, expect, test } from "bun:test"
import {
  commitsAttestationRevocationRoot,
  getFacematchEvmParameterCommitment,
  getNumberOfPublicInputs,
  type ProofResult,
} from "@zkpassport/utils"
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
      },
    })
  })

  test("gives a face match its committed inputs in the form of its circuit version", async () => {
    const rootKeyLeaf = "0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b"
    const appIdHash = "0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b"
    const committedInputsOf = async (version: NonNullable<ProofResult["version"]>) => {
      const commitment = await getFacematchEvmParameterCommitment(
        BigInt(rootKeyLeaf),
        1n,
        BigInt(appIdHash),
        2n,
        0n,
        0n,
        commitsAttestationRevocationRoot(version),
      )
      // Every public input is the face match commitment, so each commitment slot finds it
      const publicInputs = commitment
        .toString(16)
        .padStart(64, "0")
        .repeat(getNumberOfPublicInputs("outer_evm_count_4", version))
      return SolidityVerifier.getParameters({
        proof: {
          name: "outer_evm_count_4",
          version,
          vkeyHash: "0x1234",
          proof: publicInputs + "bb".repeat(32 * 12),
          committedInputs: {
            facematch_evm: {
              rootKeyLeaf,
              environment: "production",
              appIdHash,
              integrityPubkeyHash: "0x0",
              mode: "strict",
            },
          },
        },
        domain: "example.com",
      }).committedInputs
    }

    const beforeRevocationRoot = await committedInputsOf("0.22.0")
    expect(beforeRevocationRoot.slice(0, 8)).toEqual("0x0a0062")
    expect(((beforeRevocationRoot.length - 2) / 2) % (3 + 98)).toEqual(0)

    const withRevocationRoot = await committedInputsOf("0.23.0")
    expect(withRevocationRoot.slice(0, 8)).toEqual("0x0a0082")
    expect(((withRevocationRoot.length - 2) / 2) % (3 + 130)).toEqual(0)
  })
})
