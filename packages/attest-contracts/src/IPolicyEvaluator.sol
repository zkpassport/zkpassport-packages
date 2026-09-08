// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IVerifierHelper} from "@registry/IRootVerifier.sol";

/**
 * @title  IPolicyEvaluator
 * @notice Stable, core-facing surface of a policy evaluator: a stateless contract
 *         that owns a requirements schema and judges proofs against it. Extending
 *         the requirements vocabulary means deploying a new evaluator version;
 *         this interface never changes. Typed accessors (the requirements struct,
 *         a decode view for off-chain request building) are version-specific and
 *         deliberately not part of it.
 */
interface IPolicyEvaluator {
    /// @notice Reverts unless the bytes decode to a well-formed requirements
    ///         value for this evaluator's schema; called once at policy creation
    ///         so malformed requirements fail early
    function validateRequirements(bytes calldata requirements) external view;

    /**
     * @notice Judge a policy's requirements against a proof the issuance module
     *         has already verified. Reverts with an evaluator-defined error when
     *         a requirement fails.
     * @param  requirements     The policy's stored requirements bytes
     * @param  helper           The proof-version-routed helper returned by the
     *                          root verifier — the only component that can parse
     *                          committedInputs for this proof's circuit version
     * @return unique           Whether the caller must consume the nullifier
     *                          (one-per-document dedup)
     */
    function validate(
        bytes calldata requirements,
        IVerifierHelper helper,
        bytes calldata committedInputs,
        bytes32[] calldata publicInputs
    ) external view returns (bool unique);

    /// @notice Monotonic schema identifier, used off-chain to pick a decoder
    function schemaVersion() external pure returns (uint256);
}
