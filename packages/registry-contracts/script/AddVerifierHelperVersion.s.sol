/*
 * AddVerifierHelperVersion.s.sol
 *
 * Deploys a new VerifierHelper. Does NOT register the helper with the RootVerifier —
 * see RegisterVerifierHelperVersion.s.sol for that.
 *
 * VerifierHelper is stateless beyond its RootRegistry reference (no admin, no setters),
 * so there's no admin transfer step.
 *
 * Required env vars:
 *   ROOT_REGISTRY_ADDRESS - address of the RootRegistry the helper will read from
 *
 * Optional env vars:
 *   SUB_VERIFIER_VERSION  - bytes32 semver key. Used only as a label in the addresses JSON.
 *                            Defaults to bytes32(0) when omitted.
 *   CREATE2_SALT          - salt for VerifierHelper CREATE2 deployment. Defaults to bytes32(0).
 */

pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {DeployBase} from "./DeployBase.s.sol";
import {RootRegistry} from "../src/RootRegistry.sol";
import {VerifierHelper} from "../src/VerifierHelper.sol";

contract AddVerifierHelperVersionScript is DeployBase {
    bytes32 public SUB_VERIFIER_VERSION;
    bytes32 public CREATE2_SALT;

    function setUp() public {}

    function run() public {
        SUB_VERIFIER_VERSION = vm.envOr("SUB_VERIFIER_VERSION", bytes32(0));
        CREATE2_SALT = vm.envOr("CREATE2_SALT", bytes32(0));

        RootRegistry rootRegistry = RootRegistry(vm.envAddress("ROOT_REGISTRY_ADDRESS"));
        require(address(rootRegistry) != address(0), "ROOT_REGISTRY_ADDRESS must be set");

        vm.startBroadcast();

        console.log("Deploying VerifierHelper...");
        VerifierHelper helper = new VerifierHelper{salt: CREATE2_SALT}(rootRegistry);
        console.log("VerifierHelper deployed at:", address(helper));

        vm.stopBroadcast();

        _writeAddresses(helper);
    }

    function _writeAddresses(VerifierHelper helper) internal {
        string memory versionStr = _versionString(SUB_VERIFIER_VERSION);

        string memory entry = "helper_entry";
        vm.serializeAddress(entry, "address", address(helper));
        entry = vm.serializeUint(entry, "deployed_at", block.timestamp);

        _writeToAddresses(string.concat("verifier_helper_versions.", versionStr), entry);
        console.log("Wrote VerifierHelper entry under version label:", versionStr);
        console.log("Run RegisterVerifierHelperVersion.s.sol to register with RootVerifier.");
    }

    function _versionString(bytes32 version) internal pure returns (string memory) {
        if (version == bytes32(0)) return "unversioned";
        uint256 v = uint256(version);
        return string.concat(
            vm.toString(uint16(v >> 240)), ".", vm.toString(uint16(v >> 224)), ".", vm.toString(uint16(v >> 208))
        );
    }
}
