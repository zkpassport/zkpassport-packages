// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";

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
        // Dev-mode evaluators accept mock-document proofs: testnets only, never mainnet.
        bool devMode = vm.envOr("ZKPASSPORT_CREDENTIALS_DEV_MODE", false);

        vm.startBroadcast();
        PolicyEvaluatorV1 policyEvaluator =
            new PolicyEvaluatorV1{salt: evaluatorSalt}(IRootVerifier(rootVerifier), devMode);
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
        json = vm.serializeUint(json, "deployed_at", block.timestamp);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
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
 *   export EVALUATOR_SALT=0xaff5912563440cf851f9f0bfe451f004a1cf59dc58a700ae23548a008602e8ca
 *   export CREDENTIALS_SALT=0xa0f75792a261027209ba68bf657a4e5b7a2d8ebe0804382920b59e2e9ff617bc
 *
 *   forge script script/DeployZKPassportCredentials.s.sol --rpc-url <> --private-key <> --broadcast --verify --etherscan-api-key <>
 *
 */
