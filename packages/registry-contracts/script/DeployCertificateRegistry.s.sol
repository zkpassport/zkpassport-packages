pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";
import {RootValidationMode} from "../src/IRegistryInstance.sol";

contract DeployCertificateRegistryScript is Script {
    CertificateRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the initial admin, oracle, and guardian addresses from env
        address adminAddress = vm.envAddress("CERTIFICATE_REGISTRY_ADMIN_ADDRESS");
        address oracleAddress = vm.envOr("CERTIFICATE_REGISTRY_ORACLE_ADDRESS", address(0));
        address guardianAddress = vm.envOr("CERTIFICATE_REGISTRY_GUARDIAN_ADDRESS", address(0));
        require(adminAddress != address(0), "CERTIFICATE_REGISTRY_ADMIN_ADDRESS must be set");

        vm.startBroadcast();
        registry = new CertificateRegistry(adminAddress, oracleAddress, guardianAddress);
        vm.stopBroadcast();

        console.log("CertificateRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
        console.log("Oracle:", registry.oracle());
        console.log("Guardian:", registry.guardian());
    }
}
