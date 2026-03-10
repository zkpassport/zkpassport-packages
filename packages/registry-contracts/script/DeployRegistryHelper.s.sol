/*
 * DeployRegistryHelper.s.sol
 *
 * Deploys the registry helper, a read-only utility contract for querying
 * data across the root registry's sub-registries.
 */

pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {DeployBase} from "./DeployBase.s.sol";
import {RegistryHelper} from "../src/RegistryHelper.sol";
import {RootRegistry} from "../src/RootRegistry.sol";

contract DeployRegistryHelperScript is DeployBase {
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

        // Upsert helper address into root_registry section
        _ensureDeploymentsDir();
        string memory path = _addressesFilePath();
        if (!vm.exists(path)) {
            vm.writeJson("{}", path);
        }
        vm.writeJson(
            string.concat('"', vm.toString(address(helper)), '"'), path, ".root_registry.helper"
        );
        console.log("Updated addresses file:", path);
    }
}
