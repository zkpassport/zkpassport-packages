import {
  BaseError,
  ContractFunctionRevertedError,
  InsufficientFundsError,
  UserRejectedRequestError,
  decodeErrorResult,
  type Hex,
} from "viem"
import { PolicyEvaluatorV1Abi } from "@zkpassport/onchain-credentials"

export type MintError = {
  kind: "cancelled" | "insufficient-funds" | "reverted" | "failed"
  /** The revert reason or failure message; the screen phrases it. */
  detail?: string
}

/** Sort a pre-flight or transaction error into what the Mint screen offers next. */
export function describeMintError(error: unknown): MintError {
  if (!(error instanceof BaseError)) {
    return { kind: "failed", detail: error instanceof Error ? error.message : String(error) }
  }
  if (error.walk((cause) => cause instanceof UserRejectedRequestError)) {
    return { kind: "cancelled" }
  }
  if (error.walk((cause) => cause instanceof InsufficientFundsError)) {
    return { kind: "insufficient-funds" }
  }
  const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError)
  if (revert instanceof ContractFunctionRevertedError) {
    const errorName = revert.data?.errorName ?? evaluatorErrorName(revert.raw)
    return { kind: "reverted", detail: errorName ? humanizeRevert(errorName) : revert.shortMessage }
  }
  return { kind: "failed", detail: error.shortMessage }
}

// issue() bubbles the policy evaluator's reverts, whose errors are not in the credentials ABI
function evaluatorErrorName(raw: Hex | undefined): string | undefined {
  if (!raw) return undefined
  try {
    return decodeErrorResult({ abi: PolicyEvaluatorV1Abi, data: raw }).errorName
  } catch {
    return undefined
  }
}

// "ZKPassportCredentials__WalletBanned" -> "Wallet banned"
function humanizeRevert(errorName: string): string {
  const name = errorName.split("__").pop() ?? errorName
  const words = name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
