// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {PolicyEvaluatorV2} from "../src/PolicyEvaluatorV2.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {NullifierType} from "@registry/lib/Types.sol";

/// @notice Deploys a standalone evaluator, for pointing an existing ZKPassportCredentials at a new
///         one with `setPolicyEvaluator`. Policies record their evaluator at creation, so this
///         affects only policies created after the switch. POLICY_EVALUATOR_VERSION picks the
///         schema: 2 (the default; policies choose the verification methods they accept) or 1.
contract DeployPolicyEvaluatorScript is Script {
    function run() public {
        address rootVerifier = vm.envAddress("ROOT_VERIFIER_ADDRESS");
        require(rootVerifier != address(0), "ROOT_VERIFIER_ADDRESS must be set");
        bytes32 evaluatorSalt = vm.envOr("EVALUATOR_SALT", bytes32(0));
        require(evaluatorSalt != bytes32(0), "EVALUATOR_SALT must be set to a non-zero 0x-prefixed bytes32");
        bool devMode = vm.envOr("ZKPASSPORT_CREDENTIALS_DEV_MODE", false);
        NullifierType uniqueIdentifierType =
            _nullifierType(vm.envString("ZKPASSPORT_CREDENTIALS_UNIQUE_IDENTIFIER_TYPE"));

        uint256 version = vm.envOr("POLICY_EVALUATOR_VERSION", uint256(2));
        require(version == 1 || version == 2, "POLICY_EVALUATOR_VERSION must be 1 or 2");

        vm.startBroadcast();
        address policyEvaluator = version == 2
            ? address(
                new PolicyEvaluatorV2{salt: evaluatorSalt}(IRootVerifier(rootVerifier), devMode, uniqueIdentifierType)
            )
            : address(
                new PolicyEvaluatorV1{salt: evaluatorSalt}(IRootVerifier(rootVerifier), devMode, uniqueIdentifierType)
            );
        vm.stopBroadcast();

        console.log("PolicyEvaluator schema", version, "deployed at:", policyEvaluator);
        console.log("Set it with: cast send <credentials> 'setPolicyEvaluator(address)'", policyEvaluator);
    }

    /// @dev The nullifier type uniqueness policies require, matched exactly with no mock-to-real
    ///      folding: a dev-mode chain needs a mock type for uniqueness to be testable at all.
    ///      Under "none" no uniqueness policy can issue: a NONE proof has no nullifier.
    function _nullifierType(string memory value) private pure returns (NullifierType) {
        bytes32 h = keccak256(bytes(value));
        if (h == keccak256("none")) return NullifierType.NONE_NULLIFIER;
        if (h == keccak256("salted")) return NullifierType.SALTED_NULLIFIER;
        if (h == keccak256("non_salted")) return NullifierType.NON_SALTED_NULLIFIER;
        if (h == keccak256("salted_mock")) return NullifierType.SALTED_MOCK_NULLIFIER;
        if (h == keccak256("non_salted_mock")) return NullifierType.NON_SALTED_MOCK_NULLIFIER;
        revert(
            "ZKPASSPORT_CREDENTIALS_UNIQUE_IDENTIFIER_TYPE must be none, salted, non_salted, salted_mock or non_salted_mock"
        );
    }
}
