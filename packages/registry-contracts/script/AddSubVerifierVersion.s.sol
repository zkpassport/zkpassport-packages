/*
 * AddSubVerifierVersion.s.sol
 *
 * Deploys a new SubVerifier, wires its proof verifiers, optionally sets the default OPRF
 * public key hash, and transfers admin to the final admin address. Does NOT register the
 * SubVerifier with the RootVerifier — see RegisterSubVerifierVersion.s.sol for that.
 *
 * The broadcaster is the temporary admin during deployment so it can call admin-only setup
 * functions (addProofVerifiers, setDefaultOPRFPubKeyHash). Admin is transferred to the
 * provided ADMIN_ADDRESS (typically a multisig) at the very end of the script.
 *
 * Required env vars:
 *   ROOT_VERIFIER_ADDRESS - address of the RootVerifier this SubVerifier targets
 *                            (stored in the SubVerifier so it can gate `verify(...)`)
 *   ADMIN_ADDRESS         - final admin of the new SubVerifier (e.g. multisig)
 *   PROOF_VERIFIER_OUTER_COUNT_4 ... PROOF_VERIFIER_OUTER_COUNT_13 - UltraHonk verifier addresses.
 *   VKEY_HASH_OUTER_COUNT_4 ... VKEY_HASH_OUTER_COUNT_13 - bytes32 vkey hash for each outer circuit.
 *
 * Optional env vars:
 *   SUB_VERIFIER_VERSION  - bytes32 semver key. Used only as a label in the addresses JSON
 *                            (this script doesn't register on the RootVerifier).
 *                            Defaults to bytes32(0) when omitted.
 *   DEFAULT_OPRF_PUB_KEY_HASH - protocol-default OPRF pubkey hash. When non-zero, set immediately
 *                            via setDefaultOPRFPubKeyHash. Otherwise admin can set later.
 *   CREATE2_SALT          - salt for SubVerifier CREATE2 deployment. Defaults to bytes32(0).
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
        SUB_VERIFIER_VERSION = vm.envOr("SUB_VERIFIER_VERSION", bytes32(0));
        CREATE2_SALT = vm.envOr("CREATE2_SALT", bytes32(0));

        address adminAddress = vm.envAddress("ADMIN_ADDRESS");
        require(adminAddress != address(0), "ADMIN_ADDRESS must be set");

        RootVerifier rootVerifier = RootVerifier(vm.envAddress("ROOT_VERIFIER_ADDRESS"));
        require(address(rootVerifier) != address(0), "ROOT_VERIFIER_ADDRESS must be set");

        bytes32 defaultOPRFPubKeyHash = vm.envOr("DEFAULT_OPRF_PUB_KEY_HASH", bytes32(0));

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

        // Use the broadcaster as a temporary admin so the script can call admin-only setup functions.
        address tempAdmin = msg.sender;

        console.log("Deploying SubVerifier...");
        SubVerifier subVerifier = new SubVerifier{salt: CREATE2_SALT}(tempAdmin, rootVerifier);
        console.log("SubVerifier deployed at:", address(subVerifier));

        // Wire the proof verifiers (UltraHonk verifier contracts, one per outer_count_N).
        ProofVerifier[] memory pvArray = new ProofVerifier[](10);
        for (uint256 i = 0; i < 10; i++) {
            pvArray[i] = ProofVerifier({vkeyHash: vkeyHashes[i], verifier: proofVerifiers[i]});
        }
        subVerifier.addProofVerifiers(pvArray);
        console.log("Proof verifiers added");

        // Set the OPRF pub key hash if provided (skip the no-op tx + event when unset).
        if (defaultOPRFPubKeyHash != bytes32(0)) {
            subVerifier.setDefaultOPRFPubKeyHash(defaultOPRFPubKeyHash);
            console.log("Default OPRF pub key hash set");
        } else {
            console.log("DEFAULT_OPRF_PUB_KEY_HASH not provided; admin can set later");
        }

        // Hand admin over to the final admin (e.g. multisig).
        subVerifier.transferAdmin(adminAddress);
        console.log("Admin transferred to:", adminAddress);

        vm.stopBroadcast();

        _writeAddresses(subVerifier);
    }

    function _writeAddresses(SubVerifier subVerifier) internal {
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

        _writeToAddresses(string.concat("subverifier_versions.", versionStr), entry);
        console.log("Wrote SubVerifier entry under version label:", versionStr);
        console.log("Run RegisterSubVerifierVersion.s.sol to register with RootVerifier.");
    }

    function _versionString(bytes32 version) internal pure returns (string memory) {
        if (version == bytes32(0)) return "unversioned";
        uint256 v = uint256(version);
        return string.concat(
            vm.toString(uint16(v >> 240)), ".", vm.toString(uint16(v >> 224)), ".", vm.toString(uint16(v >> 208))
        );
    }

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
