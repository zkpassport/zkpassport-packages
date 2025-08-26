// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {SanctionsRegistry} from "../src/SanctionsRegistry.sol";

contract DeploySanctionsRegistryScript is Script {
    SanctionsRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the initial admin and oracle addresses from env
        address adminAddress = vm.envAddress("SANCTIONS_REGISTRY_ADMIN_ADDRESS");
        address oracleAddress = vm.envAddress("SANCTIONS_REGISTRY_ORACLE_ADDRESS");
        require(adminAddress != address(0), "SANCTIONS_REGISTRY_ADMIN_ADDRESS must be set");
        require(oracleAddress != address(0), "SANCTIONS_REGISTRY_ORACLE_ADDRESS must be set");

        vm.startBroadcast();
        registry = new SanctionsRegistry(adminAddress, oracleAddress);
        vm.stopBroadcast();

        console.log("SanctionsRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
        console.log("Oracle:", registry.oracle());
    }
}
