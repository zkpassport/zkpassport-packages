/*
 * AddVerifierHelperVersion.s.sol
 *
 * Deploys a new VerifierHelper for a given version and registers it with an
 * already-deployed RootVerifier under the version key. Does NOT deploy or modify the
 * SubVerifier — see AddSubVerifierVersion.s.sol for that.
 *
 * Required env vars:
 *   ROOT_VERIFIER_ADDRESS  - address of the already-deployed RootVerifier
 *   SUB_VERIFIER_VERSION   - bytes32 semver key for the version to associate this Helper with
 *                            (e.g. v0.0.2 = 0x0000000000020000…). Helpers and SubVerifiers
 *                            share the same version-key namespace inside RootVerifier.
 *
 * Optional env vars:
 *   CREATE2_SALT           - salt for VerifierHelper deployment (deterministic across chains).
 *                            Defaults to bytes32(0).
 */

pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {DeployBase} from "./DeployBase.s.sol";
import {RootRegistry} from "../src/RootRegistry.sol";
import {RootVerifier} from "../src/RootVerifier.sol";
import {VerifierHelper} from "../src/VerifierHelper.sol";

contract AddVerifierHelperVersionScript is DeployBase {
    bytes32 public SUB_VERIFIER_VERSION;
    bytes32 public CREATE2_SALT;

    function setUp() public {}

    function run() public {
        SUB_VERIFIER_VERSION = vm.envBytes32("SUB_VERIFIER_VERSION");
        require(SUB_VERIFIER_VERSION != bytes32(0), "SUB_VERIFIER_VERSION must be set");

        CREATE2_SALT = vm.envOr("CREATE2_SALT", bytes32(0));

        RootVerifier rootVerifier = RootVerifier(vm.envAddress("ROOT_VERIFIER_ADDRESS"));
        require(address(rootVerifier) != address(0), "ROOT_VERIFIER_ADDRESS must be set");

        // VerifierHelper needs the same RootRegistry the RootVerifier points at.
        RootRegistry rootRegistry = rootVerifier.rootRegistry();
        require(address(rootRegistry) != address(0), "RootRegistry not set on RootVerifier");

        // Sanity: this version key must not already have a Helper registered.
        require(
            address(rootVerifier.helpers(SUB_VERIFIER_VERSION)) == address(0),
            "Helper already registered for this version"
        );

        vm.startBroadcast();

        console.log("Deploying VerifierHelper...");
        VerifierHelper helper = new VerifierHelper{salt: CREATE2_SALT}(rootRegistry);
        console.log("VerifierHelper deployed at:", address(helper));

        // Register with the existing RootVerifier. Requires the broadcaster to be the RootVerifier admin.
        rootVerifier.addHelper(SUB_VERIFIER_VERSION, address(helper));
        console.log("VerifierHelper registered under version:");
        console.logBytes32(SUB_VERIFIER_VERSION);

        vm.stopBroadcast();

        _writeAddresses(rootVerifier, helper);
    }

    function _writeAddresses(RootVerifier rootVerifier, VerifierHelper helper) internal {
        string memory versionStr = _versionString(SUB_VERIFIER_VERSION);

        string memory entry = "helper_entry";
        vm.serializeAddress(entry, "address", address(helper));
        entry = vm.serializeUint(entry, "deployed_at", block.timestamp);

        _writeToAddresses(string.concat("root_verifier_versions.", versionStr, ".helper"), entry);
        console.log("Wrote VerifierHelper entry for version:", versionStr);
        console.log("RootVerifier (unchanged):", address(rootVerifier));
    }

    function _versionString(bytes32 version) internal view returns (string memory) {
        uint256 v = uint256(version);
        return string.concat(
            vm.toString(uint16(v >> 240)), ".", vm.toString(uint16(v >> 224)), ".", vm.toString(uint16(v >> 208))
        );
    }
}
