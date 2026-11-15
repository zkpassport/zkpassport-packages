// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 ZKPassport

/*
 * DeployAttestationRevocationRegistry.s.sol
 *
 * Deploys the Android attestation revocation registry.
 */

pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {AttestationRevocationRegistry} from "../src/registries/AttestationRevocationRegistry.sol";
import {RootValidationMode} from "../src/IRegistryInstance.sol";

contract DeployAttestationRevocationRegistryScript is Script {
    AttestationRevocationRegistry public registry;

    function setUp() public {}

    function run() public {
        // Get the initial admin, oracle, and guardian addresses from env
        address adminAddress = vm.envAddress("ATTESTATION_REVOCATION_REGISTRY_ADMIN_ADDRESS");
        address oracleAddress = vm.envOr("ATTESTATION_REVOCATION_REGISTRY_ORACLE_ADDRESS", address(0));
        address guardianAddress = vm.envOr("ATTESTATION_REVOCATION_REGISTRY_GUARDIAN_ADDRESS", address(0));
        require(adminAddress != address(0), "ATTESTATION_REVOCATION_REGISTRY_ADMIN_ADDRESS must be set");

        vm.startBroadcast();
        registry = new AttestationRevocationRegistry(adminAddress, oracleAddress, guardianAddress);
        vm.stopBroadcast();

        console.log("AttestationRevocationRegistry deployed at:", address(registry));
        console.log("Admin:", registry.admin());
        console.log("Oracle:", registry.oracle());
        console.log("Guardian:", registry.guardian());
    }
}
