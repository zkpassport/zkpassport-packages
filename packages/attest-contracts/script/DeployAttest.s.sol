// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";
import {IRootVerifier} from "../src/interfaces/IRootVerifier.sol";

contract DeployAttestScript is Script {
    function run() public {
        address rootVerifier = vm.envAddress("ROOT_VERIFIER_ADDRESS");
        require(rootVerifier != address(0), "ROOT_VERIFIER_ADDRESS must be set");
        string memory domain = vm.envOr("ATTEST_DOMAIN", string("zkpassport.id"));
        address adminAddress = vm.envAddress("ATTEST_ADMIN_ADDRESS");
        require(adminAddress != address(0), "ATTEST_ADMIN_ADDRESS must be set");
        address guardianAddress = vm.envOr("ATTEST_GUARDIAN_ADDRESS", address(0));
        bytes32 create2Salt = vm.envOr("CREATE2_SALT", bytes32(0));

        vm.startBroadcast();
        ZKPassportAttest attest =
            new ZKPassportAttest{salt: create2Salt}(IRootVerifier(rootVerifier), domain, adminAddress, guardianAddress);
        vm.stopBroadcast();

        console.log("ZKPassportAttest deployed at:", address(attest));

        string memory json = "attest";
        vm.serializeAddress(json, "address", address(attest));
        vm.serializeAddress(json, "root_verifier", rootVerifier);
        json = vm.serializeUint(json, "deployed_at", block.timestamp);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
