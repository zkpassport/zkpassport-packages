// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {CredentialIssuanceModuleV1} from "../src/CredentialIssuanceModuleV1.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";

contract DeployAttestScript is Script {
    function run() public {
        address rootVerifier = vm.envAddress("ROOT_VERIFIER_ADDRESS");
        require(rootVerifier != address(0), "ROOT_VERIFIER_ADDRESS must be set");
        string memory domain = vm.envOr("ZKPASSPORT_CREDENTIALS_DOMAIN", string("zkpassport.id"));
        address adminAddress = vm.envAddress("ZKPASSPORT_CREDENTIALS_ADMIN_ADDRESS");
        require(adminAddress != address(0), "ZKPASSPORT_CREDENTIALS_ADMIN_ADDRESS must be set");
        bytes32 create2Salt = vm.envOr("CREATE2_SALT", bytes32(0));

        vm.startBroadcast();
        CredentialIssuanceModuleV1 credentialIssuanceModule =
            new CredentialIssuanceModuleV1{salt: create2Salt}(IRootVerifier(rootVerifier));
        PolicyEvaluatorV1 policyEvaluator = new PolicyEvaluatorV1{salt: create2Salt}();
        ZKPassportCredentials zkPassportCredentials = new ZKPassportCredentials{salt: create2Salt}(
            domain, adminAddress, credentialIssuanceModule, policyEvaluator
        );
        vm.stopBroadcast();

        console.log("ZKPassportCredentials deployed at:", address(zkPassportCredentials));
        console.log("CredentialIssuanceModuleV1 deployed at:", address(credentialIssuanceModule));
        console.log("PolicyEvaluatorV1 deployed at:", address(policyEvaluator));

        string memory json = "attest";
        vm.serializeAddress(json, "address", address(zkPassportCredentials));
        vm.serializeAddress(json, "credential_issuance_module", address(credentialIssuanceModule));
        vm.serializeAddress(json, "policy_evaluator", address(policyEvaluator));
        vm.serializeAddress(json, "root_verifier", rootVerifier);
        json = vm.serializeUint(json, "deployed_at", block.timestamp);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
