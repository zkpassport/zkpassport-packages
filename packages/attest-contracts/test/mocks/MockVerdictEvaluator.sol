// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {CredentialIssuanceVerdict, IPolicyEvaluator} from "../../src/IPolicyEvaluator.sol";

/// @dev An evaluator that ignores the proof and returns a preconfigured verdict — used to
///      test that the ledger enforces its own invariants against any evaluator's verdict.
contract MockVerdictEvaluator is IPolicyEvaluator {
    CredentialIssuanceVerdict internal _verdict;

    function setVerdict(address wallet, bytes32 nullifier, bool unique, string memory customData) external {
        _verdict =
            CredentialIssuanceVerdict({wallet: wallet, nullifier: nullifier, unique: unique, customData: customData});
    }

    function schemaVersion() external pure returns (uint256) {
        return type(uint256).max;
    }

    function validateRequirements(bytes calldata) external pure {}

    function evaluate(string calldata, string calldata, bytes calldata, bytes calldata)
        external
        view
        returns (CredentialIssuanceVerdict memory)
    {
        return _verdict;
    }
}
