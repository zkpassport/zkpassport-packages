// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {PolicyEvaluationResult, IPolicyEvaluator} from "../../src/IPolicyEvaluator.sol";

/// @dev An evaluator that ignores the proof and returns a preconfigured result — used to
///      test that the ledger enforces its own invariants against any evaluator's result.
contract MockResultEvaluator is IPolicyEvaluator {
    PolicyEvaluationResult internal _result;

    function setResult(address wallet, bytes32 nullifier, string memory customData) external {
        _result = PolicyEvaluationResult({wallet: wallet, nullifier: nullifier, customData: customData});
    }

    function schemaVersion() external pure returns (uint256) {
        return type(uint256).max;
    }

    function validateRequirements(bytes calldata, bool) external pure {}

    function evaluate(string calldata, string calldata, bytes calldata, bool, bytes calldata)
        external
        view
        returns (PolicyEvaluationResult memory)
    {
        return _result;
    }
}
