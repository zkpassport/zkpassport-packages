// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {CircuitRegistry} from "../src/CircuitRegistry.sol";

contract DeployCircuitRegistryScript is Script {
    CircuitRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the initial admin and oracle addresses from env
        address adminAddress = vm.envAddress("CIRCUIT_REGISTRY_ADMIN_ADDRESS");
        address oracleAddress = vm.envAddress("CIRCUIT_REGISTRY_ORACLE_ADDRESS");
        require(adminAddress != address(0), "CIRCUIT_REGISTRY_ADMIN_ADDRESS must be set");
        require(oracleAddress != address(0), "CIRCUIT_REGISTRY_ORACLE_ADDRESS must be set");

        vm.startBroadcast();
        registry = new CircuitRegistry(adminAddress, oracleAddress);
        vm.stopBroadcast();

        console.log("CircuitRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
        console.log("Oracle:", registry.oracle());
    }
}
