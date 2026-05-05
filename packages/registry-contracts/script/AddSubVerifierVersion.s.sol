/*
 * AddSubVerifierVersion.s.sol
 *
 * Deploys a new SubVerifier for a given version, wires its proof verifiers, optionally
 * sets the default OPRF public key hash, and registers it with an already-deployed
 * RootVerifier under the version key. Does NOT deploy or modify the VerifierHelper —
 * see AddVerifierHelperVersion.s.sol for that.
 *
 * Required env vars:
 *   ROOT_VERIFIER_ADDRESS      - address of the already-deployed RootVerifier
 *   SUB_VERIFIER_VERSION       - bytes32 semver key for the new version (e.g. v0.0.2 = 0x0000000000020000…)
 *   SUB_VERIFIER_ADMIN_ADDRESS - admin of the new SubVerifier
 *   PROOF_VERIFIER_OUTER_COUNT_4 ... PROOF_VERIFIER_OUTER_COUNT_13 - addresses of the
 *                              UltraHonk verifier contracts compiled from the new circuits.
 *   VKEY_HASH_OUTER_COUNT_4 ... VKEY_HASH_OUTER_COUNT_13 - bytes32 vkey hash for each outer circuit.
 *
 * Optional env vars:
 *   DEFAULT_OPRF_PUB_KEY_HASH  - protocol-default OPRF pubkey hash for this SubVerifier version.
 *                              When non-zero, set immediately via setDefaultOPRFPubKeyHash.
 *                              Otherwise admin can set later.
 *   CREATE2_SALT               - salt for SubVerifier deployment (deterministic across chains).
 *                              Defaults to bytes32(0).
 */

pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {DeployBase} from "./DeployBase.s.sol";
import {RootVerifier} from "../src/RootVerifier.sol";
import {SubVerifier} from "../src/SubVerifier.sol";
import {ProofVerifier} from "../src/lib/Types.sol";

contract AddSubVerifierVersionScript is DeployBase {
    bytes32 public SUB_VERIFIER_VERSION;
    bytes32 public CREATE2_SALT;

    string[10] internal OUTER_NAMES = [
        "outer_count_4",
        "outer_count_5",
        "outer_count_6",
        "outer_count_7",
        "outer_count_8",
        "outer_count_9",
        "outer_count_10",
        "outer_count_11",
        "outer_count_12",
        "outer_count_13"
    ];

    bytes32[10] public vkeyHashes;
    address[10] public proofVerifiers;

    function setUp() public {}

    function run() public {
        SUB_VERIFIER_VERSION = vm.envBytes32("SUB_VERIFIER_VERSION");
        require(SUB_VERIFIER_VERSION != bytes32(0), "SUB_VERIFIER_VERSION must be set");

        CREATE2_SALT = vm.envOr("CREATE2_SALT", bytes32(0));

        address adminAddress = vm.envAddress("SUB_VERIFIER_ADMIN_ADDRESS");
        require(adminAddress != address(0), "SUB_VERIFIER_ADMIN_ADDRESS must be set");

        RootVerifier rootVerifier = RootVerifier(vm.envAddress("ROOT_VERIFIER_ADDRESS"));
        require(address(rootVerifier) != address(0), "ROOT_VERIFIER_ADDRESS must be set");

        bytes32 defaultOPRFPubKeyHash = vm.envOr("DEFAULT_OPRF_PUB_KEY_HASH", bytes32(0));

        // Sanity: this version key must not already have a SubVerifier registered.
        require(
            address(rootVerifier.subverifiers(SUB_VERIFIER_VERSION)) == address(0),
            "Subverifier already registered for this version"
        );

        // Read all 10 (proofVerifier, vkeyHash) pairs up front so the script fails fast if any are missing.
        for (uint256 i = 0; i < 10; i++) {
            string memory pvKey = string.concat("PROOF_VERIFIER_", _envUpper(OUTER_NAMES[i]));
            string memory vkKey = string.concat("VKEY_HASH_", _envUpper(OUTER_NAMES[i]));
            proofVerifiers[i] = vm.envAddress(pvKey);
            vkeyHashes[i] = vm.envBytes32(vkKey);
            require(proofVerifiers[i] != address(0), string.concat(pvKey, " must be set"));
            require(vkeyHashes[i] != bytes32(0), string.concat(vkKey, " must be set"));
        }

        vm.startBroadcast();

        console.log("Deploying SubVerifier...");
        SubVerifier subVerifier = new SubVerifier{salt: CREATE2_SALT}(adminAddress, rootVerifier);
        console.log("SubVerifier deployed at:", address(subVerifier));

        // Wire the proof verifiers (UltraHonk verifier contracts, one per outer_count_N).
        // Requires the broadcaster to be the SubVerifier admin (set above).
        ProofVerifier[] memory pvArray = new ProofVerifier[](10);
        for (uint256 i = 0; i < 10; i++) {
            pvArray[i] = ProofVerifier({vkeyHash: vkeyHashes[i], verifier: proofVerifiers[i]});
        }
        subVerifier.addProofVerifiers(pvArray);
        console.log("Proof verifiers added to SubVerifier");

        // Set the OPRF pub key hash if provided (skip the no-op tx + event when unset).
        if (defaultOPRFPubKeyHash != bytes32(0)) {
            subVerifier.setDefaultOPRFPubKeyHash(defaultOPRFPubKeyHash);
            console.log("Default OPRF pub key hash set");
        } else {
            console.log("DEFAULT_OPRF_PUB_KEY_HASH not provided; admin can set later via setDefaultOPRFPubKeyHash");
        }

        // Register with the existing RootVerifier. Requires the broadcaster to be the RootVerifier admin.
        rootVerifier.addSubVerifier(SUB_VERIFIER_VERSION, subVerifier);
        console.log("SubVerifier registered under version:");
        console.logBytes32(SUB_VERIFIER_VERSION);

        vm.stopBroadcast();

        _writeAddresses(rootVerifier, subVerifier);
    }

    function _writeAddresses(RootVerifier rootVerifier, SubVerifier subVerifier) internal {
        string memory versionStr = _versionString(SUB_VERIFIER_VERSION);

        string memory pvJson = "pv";
        for (uint256 i = 0; i < 9; i++) {
            vm.serializeAddress(pvJson, OUTER_NAMES[i], proofVerifiers[i]);
        }
        pvJson = vm.serializeAddress(pvJson, OUTER_NAMES[9], proofVerifiers[9]);

        string memory entry = "subverifier_entry";
        vm.serializeAddress(entry, "address", address(subVerifier));
        vm.serializeUint(entry, "deployed_at", block.timestamp);
        entry = vm.serializeString(entry, "proof_verifiers", pvJson);

        _writeToAddresses(string.concat("root_verifier_versions.", versionStr, ".subverifier"), entry);
        console.log("Wrote SubVerifier entry for version:", versionStr);
        console.log("RootVerifier (unchanged):", address(rootVerifier));
    }

    function _versionString(bytes32 version) internal view returns (string memory) {
        uint256 v = uint256(version);
        return string.concat(
            vm.toString(uint16(v >> 240)), ".", vm.toString(uint16(v >> 224)), ".", vm.toString(uint16(v >> 208))
        );
    }

    /// Uppercase ASCII a-z → A-Z; leaves digits and underscores alone.
    function _envUpper(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] >= 0x61 && b[i] <= 0x7A) {
                b[i] = bytes1(uint8(b[i]) - 32);
            }
        }
        return string(b);
    }
}
