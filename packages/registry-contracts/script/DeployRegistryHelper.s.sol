pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {RegistryHelper} from "../src/RegistryHelper.sol";
import {RootRegistry} from "../src/RootRegistry.sol";

contract DeployRegistryHelperScript is Script {
    RegistryHelper public helper;

    function setUp() public {}

    function run() public {
        // Get the root registry address from environment variable
        address rootRegistryAddress = vm.envAddress("ROOT_REGISTRY_ADDRESS");
        require(rootRegistryAddress != address(0), "ROOT_REGISTRY_ADDRESS must be set");

        vm.startBroadcast();
        helper = new RegistryHelper(RootRegistry(rootRegistryAddress));
        vm.stopBroadcast();
        console.log("RegistryHelper deployed at:", address(helper));
        console.log("RegistryHelper using RootRegistry at:", rootRegistryAddress);
    }
}
