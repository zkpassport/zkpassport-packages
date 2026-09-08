// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
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
        ZKPassportCredentials zkPassportCredentials =
            new ZKPassportCredentials{salt: create2Salt}(IRootVerifier(rootVerifier), domain, adminAddress);
        vm.stopBroadcast();

        console.log("ZKPassportCredentials deployed at:", address(zkPassportCredentials));

        string memory json = "attest";
        vm.serializeAddress(json, "address", address(zkPassportCredentials));
        vm.serializeAddress(json, "root_verifier", rootVerifier);
        vm.serializeUint(json, "deployed_at", block.timestamp);
        json = vm.serializeUint(json, "deployed_block", block.number);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
