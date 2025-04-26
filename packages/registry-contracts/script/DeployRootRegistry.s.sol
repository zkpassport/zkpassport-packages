// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {RootRegistry} from "../src/RootRegistry.sol";

contract DeployRootRegistryScript is Script {
    RootRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the root registry admin address from env
        address adminAddress = vm.envAddress("ROOT_REGISTRY_ADMIN_ADDRESS");
        require(adminAddress != address(0), "ROOT_REGISTRY_ADMIN_ADDRESS must be set");

        vm.startBroadcast();
        registry = new RootRegistry(adminAddress);
        vm.stopBroadcast();

        console.log("RootRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
    }
}
