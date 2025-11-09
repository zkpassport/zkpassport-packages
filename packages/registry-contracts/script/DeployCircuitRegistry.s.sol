pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {CircuitRegistry} from "../src/CircuitRegistry.sol";
import {RootValidationMode} from "../src/IRegistryInstance.sol";

contract DeployCircuitRegistryScript is Script {
    CircuitRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the initial admin, oracle, and guardian addresses from env
        address adminAddress = vm.envAddress("CIRCUIT_REGISTRY_ADMIN_ADDRESS");
        address oracleAddress = vm.envOr("CIRCUIT_REGISTRY_ORACLE_ADDRESS", address(0));
        address guardianAddress = vm.envOr("CIRCUIT_REGISTRY_GUARDIAN_ADDRESS", address(0));
        require(adminAddress != address(0), "CIRCUIT_REGISTRY_ADMIN_ADDRESS must be set");

        vm.startBroadcast();
        registry = new CircuitRegistry(adminAddress, oracleAddress, guardianAddress);
        vm.stopBroadcast();

        console.log("CircuitRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
        console.log("Oracle:", registry.oracle());
        console.log("Guardian:", registry.guardian());
    }
}
