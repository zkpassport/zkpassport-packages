// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

struct PolicyEvaluationResult {
    address wallet;
    bytes32 nullifier;
    string customData;
}

/**
 * @title  IPolicyEvaluator
 * @notice A stateless, view-only contract that owns a policy requirements schema and judges
 *         proofs against it: it verifies the proof through the root verifier, applies proof
 *         checks (scope, freshness, chain binding), evaluates the policy requirements, and
 *         returns the evaluation result the ledger issues from.
 *
 *         This interface and the result struct are the ledger's permanent ABI surface:
 *         proof-parameter changes, root-verifier upgrades, and requirements-schema changes are
 *         all absorbed by deploying a new evaluator, never by redeploying the ledger. Policies
 *         pin the evaluator in force at their creation, so new evaluator deployments never
 *         affect pre-existing policies.
 */
interface IPolicyEvaluator {
    /// @notice Reverts unless the bytes decode to a well-formed requirements value for this
    ///         evaluator's schema, and one a policy with the given uniqueness setting can issue
    ///         under.
    /// @param requirements      The candidate requirements bytes.
    /// @param enforceUniqueness Whether the policy consumes nullifiers (one credential per
    ///                          document).
    function validateRequirements(bytes calldata requirements, bool enforceUniqueness) external view;

    /**
     * @notice Verify a proof end-to-end and judge it against a policy's requirements, reverting
     *         with an evaluator-defined error when any check fails.
     * @param  domain       The domain proofs must be bound to (the ledger's current domain).
     * @param  subscope     The policy-specific proof scope (policyScope(policyId)).
     * @param  requirements The policy's stored requirements bytes.
     * @param  enforceUniqueness Whether the policy consumes nullifiers; the evaluator then
     *                      requires a proof whose nullifier the ledger can dedup on.
     * @param  proofData    Caller-submitted proof and verification data, opaque to the ledger;
     *                      this evaluator owns its encoding.
     * @return result       The wallet to credit, the proof's nullifier, and proof-bound
     *                       customData.
     */
    function evaluate(
        string calldata domain,
        string calldata subscope,
        bytes calldata requirements,
        bool enforceUniqueness,
        bytes calldata proofData
    ) external view returns (PolicyEvaluationResult memory result);

    /// @notice Monotonic schema identifier, used off-chain to pick requirement and proof-data
    ///         encoders.
    /// @return The schema version this evaluator implements
    function schemaVersion() external pure returns (uint256);
}
