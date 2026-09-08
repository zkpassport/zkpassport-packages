// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IVerifierHelper} from "@registry/IRootVerifier.sol";

/**
 * @title  IPolicyEvaluator
 * @notice A stateless contract that owns a policy requirements schema and judges proofs
 *         against it. Extending the requirements vocabulary requires deploying a new evaluator
 *         version, and setting it as current in the ZKPassportCredentials contract.
 */
interface IPolicyEvaluator {
    /// @notice Reverts unless the bytes decode to a well-formed requirements value for this
    ///         evaluator's schema.
    /// @param requirements The candidate requirements bytes.
    function validateRequirements(bytes calldata requirements) external view;

    /**
     * @notice Judge a policy's requirements against the committed and public inputs of a proof.
     *         Reverts with an evaluator-defined error when a requirement fails.
     * @param  requirements    The policy's stored requirements bytes.
     * @param  helper          The proof-version-routed helper returned by the root verifier,
     *                         which is the only component that can parse committedInputs for
     *                         this proof's circuit version.
     * @param  committedInputs The proof's committed inputs, opaque outside `helper`.
     * @param  publicInputs    The proof's public inputs.
     * @return unique          Whether the caller must consume the nullifier
     */
    function validate(
        bytes calldata requirements,
        IVerifierHelper helper,
        bytes calldata committedInputs,
        bytes32[] calldata publicInputs
    ) external view returns (bool unique);

    /// @notice Monotonic schema identifier, used off-chain to pick a decoder
    /// @return The schema version this evaluator implements
    function schemaVersion() external pure returns (uint256);
}
