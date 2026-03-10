/*
 * DeployRootVerifier.s.sol
 *
 * Deploys the ZKPassport root verifier, verifier helper, a subverifier, and proof verifiers
 * for outer circuits (supporting 4-13 subproofs).
 */

pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {DeployBase} from "./DeployBase.s.sol";
import {HonkVerifier} from "../src/mocks/MockHonkVerifier.sol";
import {RootRegistry} from "../src/RootRegistry.sol";
import {RootVerifier} from "../src/RootVerifier.sol";
import {SubVerifier} from "../src/SubVerifier.sol";
import {VerifierHelper} from "../src/VerifierHelper.sol";
import {ProofVerifier} from "../src/lib/Types.sol";

contract DeployRootVerifierScript is DeployBase {
    using stdJson for string;

    bytes32 public SUB_VERIFIER_VERSION;
    bytes32 public CREATE2_SALT;

    bytes32[] public vkeyHashes = [
        bytes32(hex"0404040404040404040404040404040404040404040404040404040404040404"),
        bytes32(hex"0505050505050505050505050505050505050505050505050505050505050505"),
        bytes32(hex"0606060606060606060606060606060606060606060606060606060606060606"),
        bytes32(hex"0707070707070707070707070707070707070707070707070707070707070707"),
        bytes32(hex"0808080808080808080808080808080808080808080808080808080808080808"),
        bytes32(hex"0909090909090909090909090909090909090909090909090909090909090909"),
        bytes32(hex"1010101010101010101010101010101010101010101010101010101010101010"),
        bytes32(hex"1111111111111111111111111111111111111111111111111111111111111111"),
        bytes32(hex"1212121212121212121212121212121212121212121212121212121212121212"),
        bytes32(hex"1313131313131313131313131313131313131313131313131313131313131313")
    ];
    address[] public proofVerifiers = new address[](10);

    function setUp() public {}

    function run() public {
        // Semver encoded as bytes32: first 2 bytes = major, next 2 = minor, next 2 = patch (e.g. 0x000000000001... = v0.0.1)
        SUB_VERIFIER_VERSION = vm.envOr(
            "SUB_VERIFIER_VERSION", bytes32(0x0000000000010000000000000000000000000000000000000000000000000000)
        );
        CREATE2_SALT = vm.envOr("CREATE2_SALT", bytes32(0));

        address adminAddress = vm.envAddress("ROOT_VERIFIER_ADMIN_ADDRESS");
        require(adminAddress != address(0), "ROOT_VERIFIER_ADMIN_ADDRESS must be set");

        address guardianAddress = vm.envOr("ROOT_VERIFIER_GUARDIAN_ADDRESS", address(0));

        RootRegistry rootRegistry = RootRegistry(vm.envAddress("ROOT_REGISTRY_ADDRESS"));
        require(address(rootRegistry) != address(0), "ROOT_REGISTRY_ADDRESS must be set");

        vm.startBroadcast();

        // Deploy the root verifier
        console.log("Deploying RootVerifier...");
        RootVerifier rootVerifier = new RootVerifier(adminAddress, guardianAddress, rootRegistry);
        console.log("RootVerifier deployed at:", address(rootVerifier));

        // Deploy the sub verifier
        console.log("Deploying SubVerifier...");
        SubVerifier subVerifier = new SubVerifier{salt: CREATE2_SALT}(adminAddress, rootVerifier);
        console.log("SubVerifier deployed at:", address(subVerifier));

        // Add the sub verifier to the root verifier
        rootVerifier.addSubVerifier(SUB_VERIFIER_VERSION, subVerifier);
        console.log("Sub verifier added to root verifier");

        // Deploy the verifier helper
        console.log("Deploying VerifierHelper...");
        VerifierHelper helper = new VerifierHelper{salt: CREATE2_SALT}(rootRegistry);
        console.log("VerifierHelper deployed at:", address(helper));

        // Add the helper to the root verifier
        rootVerifier.addHelper(SUB_VERIFIER_VERSION, address(helper));
        console.log("Helper added to root verifier");

        // Deploy the proof verifiers (mock HonkVerifier for each outer circuit count)
        console.log("Deploying proof verifiers...");
        for (uint256 i = 0; i < 10; i++) {
            proofVerifiers[i] = address(new HonkVerifier{salt: bytes32(i)}());
            console.log("  Outer proof verifier", i + 4, "deployed at:", proofVerifiers[i]);
        }

        // Add proof verifiers to the sub verifier
        ProofVerifier[] memory proofVerifiersArray = new ProofVerifier[](10);
        for (uint256 i = 0; i < 10; i++) {
            proofVerifiersArray[i] = ProofVerifier({vkeyHash: vkeyHashes[i], verifier: proofVerifiers[i]});
        }
        subVerifier.addProofVerifiers(proofVerifiersArray);
        console.log("Proof verifiers added to sub verifier");

        vm.stopBroadcast();

        _writeVerifierAddresses(rootVerifier, subVerifier, helper);
    }

    function _writeVerifierAddresses(RootVerifier rootVerifier, SubVerifier subVerifier, VerifierHelper helper)
        internal
    {
        uint256 v = uint256(SUB_VERIFIER_VERSION);
        string memory versionStr = string.concat(
            vm.toString(uint16(v >> 240)), ".", vm.toString(uint16(v >> 224)), ".", vm.toString(uint16(v >> 208))
        );

        // Build proof_verifiers object
        string memory pvJson = "pv";
        vm.serializeAddress(pvJson, "outer_count_4", proofVerifiers[0]);
        vm.serializeAddress(pvJson, "outer_count_5", proofVerifiers[1]);
        vm.serializeAddress(pvJson, "outer_count_6", proofVerifiers[2]);
        vm.serializeAddress(pvJson, "outer_count_7", proofVerifiers[3]);
        vm.serializeAddress(pvJson, "outer_count_8", proofVerifiers[4]);
        vm.serializeAddress(pvJson, "outer_count_9", proofVerifiers[5]);
        vm.serializeAddress(pvJson, "outer_count_10", proofVerifiers[6]);
        vm.serializeAddress(pvJson, "outer_count_11", proofVerifiers[7]);
        vm.serializeAddress(pvJson, "outer_count_12", proofVerifiers[8]);
        pvJson = vm.serializeAddress(pvJson, "outer_count_13", proofVerifiers[9]);

        // Build version object: { subverifier, helper, proof_verifiers }
        string memory versionJson = "version";
        vm.serializeAddress(versionJson, "subverifier", address(subVerifier));
        vm.serializeAddress(versionJson, "helper", address(helper));
        versionJson = vm.serializeString(versionJson, "proof_verifiers", pvJson);

        // Wrap in subverifiers: { "<version>": { ... } }
        string memory subverifiersJson = "subverifiers";
        subverifiersJson = vm.serializeString(subverifiersJson, versionStr, versionJson);

        // Build root_verifier section
        string memory section = "root_verifier";
        vm.serializeAddress(section, "address", address(rootVerifier));
        vm.serializeString(section, "subverifiers", subverifiersJson);
        section = vm.serializeUint(section, "deployed_at", block.timestamp);

        _writeToAddresses("root_verifier", section);
    }
}
