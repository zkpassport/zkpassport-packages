// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {NullifierType} from "@registry/lib/Types.sol";

contract DeployZKPassportCredentialsScript is Script {
    function run() public {
        address rootVerifier = vm.envAddress("ROOT_VERIFIER_ADDRESS");
        require(rootVerifier != address(0), "ROOT_VERIFIER_ADDRESS must be set");
        string memory domain = vm.envOr("ZKPASSPORT_CREDENTIALS_DOMAIN", string("zkpassport.id"));
        address adminAddress = vm.envAddress("ZKPASSPORT_CREDENTIALS_ADMIN_ADDRESS");
        require(adminAddress != address(0), "ZKPASSPORT_CREDENTIALS_ADMIN_ADDRESS must be set");
        bytes32 create2Salt = vm.envOr("CREATE2_SALT", bytes32(0));
        bytes32 evaluatorSalt = vm.envOr("EVALUATOR_SALT", create2Salt);
        bytes32 credentialsSalt = vm.envOr("CREDENTIALS_SALT", create2Salt);
        require(credentialsSalt != bytes32(0), "CREDENTIALS_SALT must be a non-zero 0x-prefixed bytes32");
        // Reusing an evaluator already at its CREATE2 address: deploying it again would revert
        address existingEvaluator = vm.envOr("POLICY_EVALUATOR_ADDRESS", address(0));
        require(
            existingEvaluator != address(0) || evaluatorSalt != bytes32(0),
            "EVALUATOR_SALT must be a non-zero 0x-prefixed bytes32, or set POLICY_EVALUATOR_ADDRESS"
        );
        // Dev-mode evaluators accept mock-document proofs: testnets only, never mainnet.
        bool devMode = vm.envOr("ZKPASSPORT_CREDENTIALS_DEV_MODE", false);
        NullifierType uniqueIdentifierType =
            _nullifierType(vm.envString("ZKPASSPORT_CREDENTIALS_UNIQUE_IDENTIFIER_TYPE"));

        vm.startBroadcast();
        PolicyEvaluatorV1 policyEvaluator = existingEvaluator != address(0)
            ? PolicyEvaluatorV1(existingEvaluator)
            : new PolicyEvaluatorV1{salt: evaluatorSalt}(IRootVerifier(rootVerifier), devMode, uniqueIdentifierType);
        ZKPassportCredentials zkPassportCredentials =
            new ZKPassportCredentials{salt: credentialsSalt}(domain, adminAddress, policyEvaluator);
        vm.stopBroadcast();

        console.log("ZKPassportCredentials deployed at:", address(zkPassportCredentials));
        console.log("PolicyEvaluatorV1 deployed at:", address(policyEvaluator));

        string memory json = "credentials";
        vm.serializeAddress(json, "address", address(zkPassportCredentials));
        vm.serializeAddress(json, "policy_evaluator", address(policyEvaluator));
        vm.serializeAddress(json, "root_verifier", rootVerifier);
        vm.serializeBool(json, "dev_mode", devMode);
        vm.serializeUint(json, "unique_identifier_type", uint256(uniqueIdentifierType));
        json = vm.serializeUint(json, "deployed_at", block.timestamp);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
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

/**
 *   Usage:
 *   In zkpassport-packages/packages/onchain-credentials/contracts
 *
 *   export ROOT_VERIFIER_ADDRESS=0x1D000001000EFD9a6371f4d90bB8920D5431c0D8
 *   export ZKPASSPORT_CREDENTIALS_DOMAIN=zkpassport.id
 *   export ZKPASSPORT_CREDENTIALS_ADMIN_ADDRESS=0x2000ab040a899f914D6DfD2457C3dFBB22d4c762
 *   export ZKPASSPORT_CREDENTIALS_DEV_MODE=false
 *   export ZKPASSPORT_CREDENTIALS_UNIQUE_IDENTIFIER_TYPE=salted
 *   export EVALUATOR_SALT=0xaff5912563440cf851f9f0bfe451f004a1cf59dc58a700ae23548a008602e8ca
 *   export CREDENTIALS_SALT=0xa0f75792a261027209ba68bf657a4e5b7a2d8ebe0804382920b59e2e9ff617bc
 *
 *   forge script script/DeployZKPassportCredentials.s.sol --rpc-url <> --private-key <> --broadcast --verify --etherscan-api-key <>
 *
 */
