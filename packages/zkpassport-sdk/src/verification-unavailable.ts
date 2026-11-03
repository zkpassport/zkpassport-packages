import type { VerificationUnavailableReason } from "./types"

/**
 * Thrown by the verifiers when a check could not run: the registry or RPC did not answer, or the
 * verification engine failed. It is not a verdict about the proofs, so callers that catch it must
 * not report the proofs as invalid. `verifyLocally` turns it into a {@link VerificationResult}
 * with `verified: false` and `couldNotVerify` set to {@link reason}.
 */
export class VerificationUnavailableError extends Error {
  constructor(
    public readonly reason: VerificationUnavailableReason,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = "VerificationUnavailableError"
  }
}
