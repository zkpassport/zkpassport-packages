// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ProofVerificationParams} from "@registry/lib/Types.sol";

struct CredentialIssuanceVerdict {
    address wallet;
    bytes32 nullifier;
    bool unique;
    string customData;
}

/**
 * @title  ICredentialIssuanceModule
 * @notice A stateless, view-only contract that verifies a proof through the root verifier,
 *         applies checks (scope, freshness, chain binding), consults the policy's evaluator,
 *         and returns a verdict on whether the credential may be issued or not.
 */
interface ICredentialIssuanceModule {
    /**
     * @notice Verify a proof end-to-end and decide whether a credential may
     *         issue, reverting when any check fails.
     * @param  domain                  The domain proofs must be bound to (the ledger's
     *                                 current domain).
     * @param  subscope                The policy-specific proof scope (policyScope(policyId)).
     * @param  evaluator               The evaluator recorded on the policy at creation.
     * @param  requirements            The policy's stored requirements bytes.
     * @param  proofVerificationParams Proof and verification data submitted by the caller.
     * @return verdict                 The wallet to credit, the nullifier and whether the
     *                                 ledger must consume it, and proof-bound customData.
     */
    function judge(
        string calldata domain,
        string calldata subscope,
        address evaluator,
        bytes calldata requirements,
        ProofVerificationParams calldata proofVerificationParams
    ) external view returns (CredentialIssuanceVerdict memory verdict);
}
