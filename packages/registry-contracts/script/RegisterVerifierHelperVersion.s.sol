/*
 * RegisterVerifierHelperVersion.s.sol
 *
 * Registers an already-deployed VerifierHelper with the RootVerifier under the given version key.
 * The broadcaster must be the RootVerifier admin.
 *
 * Required env vars:
 *   ROOT_VERIFIER_ADDRESS  - address of the deployed RootVerifier
 *   SUB_VERIFIER_VERSION   - bytes32 semver key for the version (helpers and SubVerifiers share
 *                            the same version-key namespace inside RootVerifier)
 *   VERIFIER_HELPER_ADDRESS - address of the deployed VerifierHelper to register
 */

pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {RootVerifier} from "../src/RootVerifier.sol";

contract RegisterVerifierHelperVersionScript is Script {
    function setUp() public {}

    function run() public {
        bytes32 version = vm.envBytes32("SUB_VERIFIER_VERSION");
        require(version != bytes32(0), "SUB_VERIFIER_VERSION must be set");

        RootVerifier rootVerifier = RootVerifier(vm.envAddress("ROOT_VERIFIER_ADDRESS"));
        require(address(rootVerifier) != address(0), "ROOT_VERIFIER_ADDRESS must be set");

        address helperAddress = vm.envAddress("VERIFIER_HELPER_ADDRESS");
        require(helperAddress != address(0), "VERIFIER_HELPER_ADDRESS must be set");

        // Sanity: this version key must not already have a Helper registered.
        require(
            address(rootVerifier.helpers(version)) == address(0), "VerifierHelper already registered for this version"
        );

        vm.startBroadcast();

        rootVerifier.addHelper(version, helperAddress);
        console.log("VerifierHelper registered:");
        console.log("  RootVerifier:", address(rootVerifier));
        console.log("  VerifierHelper:", helperAddress);
        console.log("  version:");
        console.logBytes32(version);

        vm.stopBroadcast();
    }
}
