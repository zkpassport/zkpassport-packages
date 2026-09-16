import { describe, expect, test } from "bun:test"
import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  encodeErrorResult,
} from "viem"
import { PolicyEvaluatorV1Abi, ZKPassportCredentialsAbi } from "@zkpassport/onchain-credentials"
import { describeMintError } from "../src/credential-flow/mint-errors"

describe("describeMintError", () => {
  test("a rejection in the wallet is a cancellation, however deeply wrapped", () => {
    const rejected = new UserRejectedRequestError(new Error("User rejected the request."))
    const wrapped = new BaseError("Transaction failed", { cause: rejected })
    expect(describeMintError(wrapped)).toEqual({ kind: "cancelled" })
  })

  test("missing gas money asks for another wallet", () => {
    expect(describeMintError(new InsufficientFundsError())).toEqual({ kind: "insufficient-funds" })
  })

  test("a contract revert is named in plain words", () => {
    const data = encodeErrorResult({
      abi: ZKPassportCredentialsAbi,
      errorName: "ZKPassportCredentials__WalletBanned",
    })
    const revert = new ContractFunctionRevertedError({
      abi: ZKPassportCredentialsAbi,
      data,
      functionName: "issue",
    })
    expect(describeMintError(revert)).toEqual({ kind: "reverted", detail: "Wallet banned" })
  })

  test("a revert forwarded from the policy evaluator is named too", () => {
    // issue() bubbles the evaluator's reverts, whose errors are not in the credentials ABI
    const data = encodeErrorResult({
      abi: PolicyEvaluatorV1Abi,
      errorName: "PolicyEvaluator__InvalidProof",
    })
    const revert = new ContractFunctionRevertedError({
      abi: ZKPassportCredentialsAbi,
      data,
      functionName: "issue",
    })
    expect(describeMintError(revert)).toEqual({ kind: "reverted", detail: "Invalid proof" })
  })

  test("anything else is a plain failure carrying its message", () => {
    expect(describeMintError(new Error("Credential mint reverted (tx 0xabc)."))).toEqual({
      kind: "failed",
      detail: "Credential mint reverted (tx 0xabc).",
    })
  })
})
