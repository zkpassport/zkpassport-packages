// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "@registry/IRootVerifier.sol";
import {PolicyEvaluationResult, IPolicyEvaluator} from "../../src/IPolicyEvaluator.sol";

/// @dev A schema-1 evaluator with a deliberately different requirements layout —
///      abi.encode(uint256 minAge) — and its own root verifier, used to test that policies
///      are judged under the evaluator (schema and verifier included) they were created
///      with, across an evaluator swap.
contract MockEvaluatorV1_2 is IPolicyEvaluator {
    error MockEvaluatorV1_2__InvalidRequirements();
    error MockEvaluatorV1_2__InvalidProof();
    error MockEvaluatorV1_2__AgeNotMet();

    IRootVerifier public immutable rootVerifier;

    constructor(IRootVerifier _rootVerifier) {
        rootVerifier = _rootVerifier;
    }

    function schemaVersion() external pure returns (uint256) {
        return 1;
    }

    function validateRequirements(bytes calldata requirements) external pure {
        uint256 minAge = abi.decode(requirements, (uint256));
        if (minAge > 150) revert MockEvaluatorV1_2__InvalidRequirements();
    }

    function evaluate(string calldata, string calldata, bytes calldata requirements, bool, bytes calldata proofData)
        external
        view
        returns (PolicyEvaluationResult memory result)
    {
        ProofVerificationParams memory params = abi.decode(proofData, (ProofVerificationParams));
        (bool valid, bytes32 nullifier, IVerifierHelper helper) = rootVerifier.verify(params);
        if (!valid) revert MockEvaluatorV1_2__InvalidProof();

        uint256 minAge = abi.decode(requirements, (uint256));
        if (minAge > 0 && !helper.isAgeAboveOrEqual(uint8(minAge), params.committedInputs)) {
            revert MockEvaluatorV1_2__AgeNotMet();
        }

        BoundData memory bound = helper.getBoundData(params.committedInputs);
        result.wallet = bound.senderAddress;
        result.customData = bound.customData;
        result.nullifier = nullifier;
    }
}
