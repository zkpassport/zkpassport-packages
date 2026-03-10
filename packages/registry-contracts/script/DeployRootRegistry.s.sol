/*
 * DeployRootRegistry.s.sol
 *
 * Deploys the root registry, which serves as the top-level registry that tracks
 * all sub-registries (certificates, circuits, sanctions, etc.).
 */

pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {DeployBase} from "./DeployBase.s.sol";
import {RootRegistry} from "../src/RootRegistry.sol";

contract DeployRootRegistryScript is DeployBase {
    using stdJson for string;

    RootRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the root registry admin address from env
        address adminAddress = vm.envAddress("ROOT_REGISTRY_ADMIN_ADDRESS");
        require(adminAddress != address(0), "ROOT_REGISTRY_ADMIN_ADDRESS must be set");

        // Get the root registry guardian address from env (defaults to address(0) if not set)
        address guardianAddress = vm.envOr("ROOT_REGISTRY_GUARDIAN_ADDRESS", address(0));

        vm.startBroadcast();
        registry = new RootRegistry(adminAddress, guardianAddress);
        vm.stopBroadcast();

        console.log("RootRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
        console.log("Guardian:", registry.guardian());

        string memory section = "root_registry";
        vm.serializeAddress(section, "address", address(registry));
        vm.serializeAddress(section, "admin", adminAddress);
        vm.serializeAddress(section, "guardian", guardianAddress);
        section = vm.serializeUint(section, "deployed_at", block.timestamp);

        _writeToAddresses("root_registry", section);
    }
}
