// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IVerifierHelper} from "@registry/IRootVerifier.sol";
import {IPolicyEvaluator} from "../../src/IPolicyEvaluator.sol";

/// @dev A schema-2 evaluator with a deliberately different requirements layout —
///      abi.encode(uint256 minAge) — used to test that policies are judged under
///      the schema they were created with, across an evaluator swap.
contract MockEvaluatorV2 is IPolicyEvaluator {
    error MockEvaluatorV2__InvalidRequirements();
    error MockEvaluatorV2__AgeNotMet();

    function schemaVersion() external pure returns (uint256) {
        return 2;
    }

    function validateRequirements(bytes calldata requirements) external pure {
        uint256 minAge = abi.decode(requirements, (uint256));
        if (minAge > 150) revert MockEvaluatorV2__InvalidRequirements();
    }

    function validate(
        bytes calldata requirements,
        IVerifierHelper helper,
        bytes calldata committedInputs,
        bytes32[] calldata
    ) external view returns (bool unique) {
        uint256 minAge = abi.decode(requirements, (uint256));
        if (minAge > 0 && !helper.isAgeAboveOrEqual(uint8(minAge), committedInputs)) {
            revert MockEvaluatorV2__AgeNotMet();
        }
        return false;
    }
}
