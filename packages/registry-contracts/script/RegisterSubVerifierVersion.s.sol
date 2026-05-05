/*
 * RegisterSubVerifierVersion.s.sol
 *
 * Registers an already-deployed SubVerifier with the RootVerifier under the given version key.
 * The broadcaster must be the RootVerifier admin.
 *
 * Required env vars:
 *   ROOT_VERIFIER_ADDRESS - address of the deployed RootVerifier
 *   SUB_VERIFIER_VERSION  - bytes32 semver key for the version (e.g. v0.0.2 = 0x0000000000020000…)
 *   SUB_VERIFIER_ADDRESS  - address of the deployed SubVerifier to register
 */

pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {RootVerifier} from "../src/RootVerifier.sol";
import {SubVerifier} from "../src/SubVerifier.sol";

contract RegisterSubVerifierVersionScript is Script {
    function setUp() public {}

    function run() public {
        bytes32 version = vm.envBytes32("SUB_VERIFIER_VERSION");
        require(version != bytes32(0), "SUB_VERIFIER_VERSION must be set");

        RootVerifier rootVerifier = RootVerifier(vm.envAddress("ROOT_VERIFIER_ADDRESS"));
        require(address(rootVerifier) != address(0), "ROOT_VERIFIER_ADDRESS must be set");

        SubVerifier subVerifier = SubVerifier(vm.envAddress("SUB_VERIFIER_ADDRESS"));
        require(address(subVerifier) != address(0), "SUB_VERIFIER_ADDRESS must be set");

        // Sanity: this version key must not already have a SubVerifier registered.
        require(
            address(rootVerifier.subverifiers(version)) == address(0), "SubVerifier already registered for this version"
        );
        // Sanity: the SubVerifier should point at this RootVerifier.
        require(
            address(subVerifier.rootVerifier()) == address(rootVerifier),
            "SubVerifier was deployed against a different RootVerifier"
        );

        vm.startBroadcast();

        rootVerifier.addSubVerifier(version, subVerifier);
        console.log("SubVerifier registered:");
        console.log("  RootVerifier:", address(rootVerifier));
        console.log("  SubVerifier:", address(subVerifier));
        console.log("  version:");
        console.logBytes32(version);

        vm.stopBroadcast();
    }
}
