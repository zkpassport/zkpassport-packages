// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {RegistryInstance} from "../../src/RegistryInstance.sol";

/**
 * @title SeedRegistriesScript
 * @dev Test utility script to seed registry instances with historical roots
 *
 * ⚠️  FOR TESTING ONLY - DO NOT USE IN PRODUCTION ⚠️
 * This script is used by integration tests in packages/registry-sdk
 *
 * This script creates 10 historical roots for each registry with the following behavior:
 * - Roots 1-9: Generated deterministically with i*100 leaves
 * - Root 5: Gets revoked immediately after creation
 * - Root 10: Uses predefined fixture values from environment variables
 *
 * Environment variables:
 * - ORACLE_ADDRESS: Oracle address (default: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8)
 * - CERTIFICATE_REGISTRY_ADDRESS: Address of the Certificate Registry (required)
 * - CIRCUIT_REGISTRY_ADDRESS: Address of the Circuit Registry (required)
 * - SANCTIONS_REGISTRY_ADDRESS: Address of the Sanctions Registry (required)
 * - CERTIFICATE_REGISTRY_ROOT: Final certificate registry root (default: hardcoded fixture)
 * - CIRCUIT_REGISTRY_ROOT: Final circuit registry root (default: hardcoded fixture)
 * - SANCTIONS_REGISTRY_ROOT: Final sanctions registry root (default: hardcoded fixture)
 *
 * Usage:
 *   forge script script/test/SeedRegistries.s.sol --rpc-url $RPC_URL --broadcast -vvv
 */
contract SeedRegistriesScript is Script {
    // These are the test fixture roots and CIDs from registry-sdk
    bytes32 constant DEFAULT_CERTIFICATE_REGISTRY_ROOT =
        0x03c239fdfafd89a568efac9175c32b998e208c4ab453d3615a31c83e65c90686;
    bytes32 constant DEFAULT_CIRCUIT_REGISTRY_ROOT = 0x068f6e356f993bd2afaf3d3466efff1dd4bc06f61952ac336085b832b93289a7;
    bytes32 constant DEFAULT_SANCTIONS_REGISTRY_ROOT =
        0x099699583ea7729a4a05821667645e927b74feb4e6e5382c6e4370e35ed2b23c;
    // CIDs for the 10th roots
    bytes32 constant CERTIFICATE_REGISTRY_CID = 0x2faca44e2b6e4e88a8bbba15bc53b0a7604b693c7733d3d4995c445b5a6258a2; // QmRYkZEm7ueX8XT82QuYTdL6iivv3gryoi2jJsPzvsdu6H
    bytes32 constant CIRCUIT_REGISTRY_CID = 0xc49583d83cde885ac798b7bd39f9910ba72b72faf27cbda4a5fcf951c3282019; // bafybeigeswb5qpg6rbnmpgfxxu47teilu4vxf6xsps62jjp47fi4gkbade
    bytes32 constant SANCTIONS_REGISTRY_CID = 0x2faca44e2b6e4e88a8bbba15bc53b0a7604b693c7733d3d4995c445b5a6258a2; // QmRYkZEm7ueX8XT82QuYTdL6iivv3gryoi2jJsPzvsdu6H

    function setUp() public {}

    function run() public {
        address oracleAddress = vm.envOr("ORACLE_ADDRESS", address(0x70997970C51812dc3A010C7d01b50e0d17dc79C8));

        bytes32 certificateRegistryRoot = vm.envOr("CERTIFICATE_REGISTRY_ROOT", DEFAULT_CERTIFICATE_REGISTRY_ROOT);
        bytes32 circuitRegistryRoot = vm.envOr("CIRCUIT_REGISTRY_ROOT", DEFAULT_CIRCUIT_REGISTRY_ROOT);
        bytes32 sanctionsRegistryRoot = vm.envOr("SANCTIONS_REGISTRY_ROOT", DEFAULT_SANCTIONS_REGISTRY_ROOT);

        // Get registry addresses from environment variables
        address certificateRegistryAddress = vm.envAddress("CERTIFICATE_REGISTRY_ADDRESS");
        console.log("Using CertificateRegistry address:", certificateRegistryAddress);

        address circuitRegistryAddress = vm.envAddress("CIRCUIT_REGISTRY_ADDRESS");
        console.log("Using CircuitRegistry address:", circuitRegistryAddress);

        address sanctionsRegistryAddress = vm.envAddress("SANCTIONS_REGISTRY_ADDRESS");
        console.log("Using SanctionsRegistry address:", sanctionsRegistryAddress);

        // Update Certificate Registry roots
        console.log("Creating Certificate Registry historical roots...");
        updateRegistryRoots(
            certificateRegistryAddress, oracleAddress, certificateRegistryRoot, CERTIFICATE_REGISTRY_CID
        );

        // Update Circuit Registry roots
        console.log("Creating Circuit Registry historical roots...");
        updateRegistryRoots(circuitRegistryAddress, oracleAddress, circuitRegistryRoot, CIRCUIT_REGISTRY_CID);

        // Update Sanctions Registry roots
        console.log("Creating Sanctions Registry historical roots...");
        updateRegistryRoots(sanctionsRegistryAddress, oracleAddress, sanctionsRegistryRoot, SANCTIONS_REGISTRY_CID);
    }

    function updateRegistryRoots(address registryAddress, address oracleAddress, bytes32 finalRoot, bytes32 finalCid)
        internal
    {
        RegistryInstance registry = RegistryInstance(registryAddress);

        vm.startBroadcast(oracleAddress);

        // Use a base timestamp (current block timestamp)
        // For production, this ensures chronological ordering with explicit timestamps
        uint256 baseTimestamp = block.timestamp;
        bytes32 currentRoot = bytes32(0);

        // Loop to create 10 roots
        for (uint256 i = 1; i <= 10; i++) {
            bytes32 root;
            bytes32 cid;
            uint256 leavesCount;
            uint256 timestamp;

            // Use the fixture roots and CIDs for the last root update
            if (i == 10) {
                root = finalRoot;
                cid = finalCid;
                leavesCount = 5;
            } else {
                // Generate a hash for the root
                root = generateHash(i);
                // Generate a hash for the CID
                cid = generateHash(i);
                // Calculate a simulated leaves count - each root has i*100 certificates
                leavesCount = i * 100;
            }

            // Set explicit timestamp for each root (1 day apart)
            timestamp = baseTimestamp + (i * 1 days);

            // Call updateRoot with explicit timestamp and current root check
            registry.updateRoot(root, currentRoot, timestamp, leavesCount, cid);

            // Update current root for next iteration
            currentRoot = root;

            // If this is the 5th root (i=5), revoke it immediately after creating it
            if (i == 5) {
                console.log("Revoking root #5:", vm.toString(root));
                registry.setRevocationStatus(root, true);
            }
        }

        vm.stopBroadcast();
    }

    function generateHash(uint256 value) internal pure returns (bytes32) {
        return sha256(abi.encodePacked(vm.toString(value)));
    }
}
