// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";

contract DeployCertificateRegistryScript is Script {
    CertificateRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the initial admin and oracle addresses from env
        address adminAddress = vm.envAddress("CERTIFICATE_REGISTRY_ADMIN_ADDRESS");
        address oracleAddress = vm.envAddress("CERTIFICATE_REGISTRY_ORACLE_ADDRESS");
        require(adminAddress != address(0), "CERTIFICATE_REGISTRY_ADMIN_ADDRESS must be set");
        require(oracleAddress != address(0), "CERTIFICATE_REGISTRY_ORACLE_ADDRESS must be set");

        vm.startBroadcast();
        registry = new CertificateRegistry(adminAddress, oracleAddress);
        vm.stopBroadcast();

        console.log("CertificateRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
        console.log("Oracle:", registry.oracle());
    }
}
