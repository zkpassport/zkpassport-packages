pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {CertificateRegistry} from "../src/CertificateRegistry.sol";
import {RootValidationMode} from "../src/IRegistryInstance.sol";

contract DeployCertificateRegistryScript is Script {
    CertificateRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the initial admin and oracle addresses from env
        address adminAddress = vm.envAddress("CERTIFICATE_REGISTRY_ADMIN_ADDRESS");
        address oracleAddress = vm.envAddress("CERTIFICATE_REGISTRY_ORACLE_ADDRESS");
        require(adminAddress != address(0), "CERTIFICATE_REGISTRY_ADMIN_ADDRESS must be set");
        require(oracleAddress != address(0), "CERTIFICATE_REGISTRY_ORACLE_ADDRESS must be set");

        uint256 certificateRegistryHeight = 16;
        uint256 validityWindowSecs = 3600; // 1 hour

        vm.startBroadcast();
        registry = new CertificateRegistry(
            adminAddress, oracleAddress, certificateRegistryHeight, RootValidationMode.LATEST_ONLY, validityWindowSecs
        );
        vm.stopBroadcast();

        console.log("CertificateRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
        console.log("Oracle:", registry.oracle());
    }
}
