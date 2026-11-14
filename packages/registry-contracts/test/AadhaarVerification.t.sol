// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {RootVerifier} from "../src/RootVerifier.sol";
import {RootRegistry} from "../src/RootRegistry.sol";
import {SubVerifier} from "../src/SubVerifier.sol";
import {VerifierHelper} from "../src/VerifierHelper.sol";
import {InputsExtractor} from "../src/lib/InputsExtractor.sol";
import {Credentials} from "../src/lib/Credentials.sol";
import {FaceMatch} from "../src/lib/AttestedId.sol";
import {AppAttest} from "../src/lib/Constants.sol";
import {
    Environment,
    ProofVerificationData,
    ProofVerificationParams,
    ProofVerifier,
    ServiceConfig
} from "../src/lib/Types.sol";
import {AlwaysValidRootRegistry, FIXTURE_APP_ID_HASH, FIXTURE_ROOT_KEY_HASH} from "./Tier2Verification.t.sol";
import {HonkVerifier as OuterAadhaarCount3Verifier} from "./fixtures/aadhaar/OuterAadhaarCount3.sol";

contract AadhaarVerificationTest is Test {
    bytes32 constant VERSION = bytes32("0.23.0");
    bytes32 constant VKEY_HASH = bytes32(uint256(0xaad));
    uint256 constant UIDAI_AADHAAR = 101;

    RootVerifier rootVerifier;
    RootVerifier testRootVerifier;
    bytes proof;
    bytes32[] publicInputs;
    bytes committedInputs;
    string domain;
    string scope;

    function setUp() public {
        string memory dir = string.concat(vm.projectRoot(), "/test/fixtures/aadhaar/");
        proof = vm.parseBytes(string.concat("0x", vm.readFile(string.concat(dir, "proof.hex"))));
        publicInputs = vm.parseJsonBytes32Array(vm.readFile(string.concat(dir, "public_inputs.json")), "");
        committedInputs = vm.parseBytes(string.concat("0x", vm.readFile(string.concat(dir, "committed_inputs.hex"))));
        string memory attestation = vm.readFile(string.concat(dir, "attestation.json"));
        domain = vm.parseJsonString(attestation, ".domain");
        scope = vm.parseJsonString(attestation, ".scope");
        assertEq(vm.parseJsonBytes32(attestation, ".rootKeyHash"), FIXTURE_ROOT_KEY_HASH);
        assertEq(vm.parseJsonBytes32(attestation, ".appIdHash"), FIXTURE_APP_ID_HASH);

        RootRegistry registry = RootRegistry(address(new AlwaysValidRootRegistry()));
        address verifier = address(new OuterAadhaarCount3Verifier());
        rootVerifier = _deploy(registry, verifier, false);
        testRootVerifier = _deploy(registry, verifier, true);
        vm.warp(vm.parseJsonUint(attestation, ".currentDate"));
    }

    function _deploy(RootRegistry registry, address verifier, bool acceptFixture) internal returns (RootVerifier root) {
        root = new RootVerifier(address(this), address(this), registry);
        SubVerifier sub = acceptFixture
            ? new FixtureFaceMatchSubVerifier(address(this), root)
            : new SubVerifier(address(this), root, bytes32(0));
        ProofVerifier[] memory verifiers = new ProofVerifier[](1);
        verifiers[0] = ProofVerifier({vkeyHash: VKEY_HASH, verifier: verifier});
        sub.addProofVerifiers(verifiers);
        root.addSubVerifier(VERSION, sub);
    }

    function _params(bytes memory proofBytes, bytes memory inputs)
        internal
        view
        returns (ProofVerificationParams memory)
    {
        return ProofVerificationParams({
            version: VERSION,
            proofVerificationData: ProofVerificationData({
                vkeyHash: VKEY_HASH, proof: proofBytes, publicInputs: publicInputs
            }),
            committedInputs: inputs,
            serviceConfig: ServiceConfig({
                validityPeriodInSeconds: 1 days, domain: domain, scope: scope, devMode: false
            })
        });
    }

    function test_AadhaarOuterProofVerifiesOnChain() public view {
        assertEq(uint256(publicInputs[publicInputs.length - 1]), UIDAI_AADHAAR);
        (bool valid, bytes32 uniqueIdentifier,) = testRootVerifier.verify(_params(proof, committedInputs));
        assertTrue(valid, "The Aadhaar outer proof should verify");
        assertEq(uniqueIdentifier, publicInputs[publicInputs.length - 3], "The scoped nullifier");
    }

    function test_ProductionVerifierRefusesASelfSignedFaceMatch() public {
        vm.expectRevert("Invalid Aadhaar face match");
        rootVerifier.verify(_params(proof, committedInputs));
    }

    function test_AadhaarIsGovernmentSignedAndVerifiable() public pure {
        assertTrue(Credentials.isVerifiable(UIDAI_AADHAAR));
        assertEq(Credentials.tierOf(UIDAI_AADHAAR), 1);
        assertTrue(Credentials.isAllowed(UIDAI_AADHAAR, new uint256[](0)));
        uint256[] memory chipOnly = new uint256[](1);
        chipOnly[0] = 100;
        assertFalse(Credentials.isAllowed(UIDAI_AADHAAR, chipOnly));
    }

    function test_ATamperedProofDoesNotVerify() public view {
        bytes memory tampered = proof;
        tampered[100] = bytes1(uint8(tampered[100]) ^ 1);
        try testRootVerifier.verify(_params(tampered, committedInputs)) returns (bool valid, bytes32, VerifierHelper) {
            assertFalse(valid);
        } catch {}
    }
}

contract AadhaarFaceMatchRuleTest is Test {
    FaceMatchHarness harness = new FaceMatchHarness();

    function _facematchEntry(bytes32 rootKeyHash, Environment environment, bytes32 appIdHash, bytes32 integrityKeyHash)
        internal
        pure
        returns (bytes memory)
    {
        return
            abi.encodePacked(
                uint8(10), uint16(98), rootKeyHash, uint8(environment), appIdHash, integrityKeyHash, uint8(1)
            );
    }

    function test_RequiresAFaceMatch() public {
        bytes memory discloseOnly = abi.encodePacked(uint8(0), uint16(2), uint16(0));
        vm.expectRevert("Facematch proof inputs not found");
        harness.verify(discloseOnly);
    }

    function test_AcceptsTheAppOnEitherPlatform() public view {
        harness.verify(
            _facematchEntry(
                AppAttest.APPLE_ROOT_KEY_HASH, Environment.PRODUCTION, AppAttest.IOS_APP_ID_HASH, bytes32(0)
            )
        );
        harness.verify(
            _facematchEntry(
                AppAttest.GOOGLE_ECDSA_ROOT_KEY_HASH,
                Environment.PRODUCTION,
                AppAttest.ANDROID_APP_ID_HASH,
                AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH
            )
        );
    }

    function test_RefusesADevelopmentFaceMatch() public {
        vm.expectRevert("Invalid Aadhaar face match");
        harness.verify(
            _facematchEntry(
                AppAttest.APPLE_ROOT_KEY_HASH, Environment.DEVELOPMENT, AppAttest.IOS_APP_ID_HASH, bytes32(0)
            )
        );
    }

    function test_RefusesAnotherPlatformsApp() public pure {
        assertFalse(
            FaceMatch.isGenuine(
                AppAttest.APPLE_ROOT_KEY_HASH, Environment.PRODUCTION, AppAttest.ANDROID_APP_ID_HASH, bytes32(0)
            )
        );
        assertFalse(
            FaceMatch.isGenuine(
                AppAttest.GOOGLE_RSA_ROOT_KEY_HASH, Environment.PRODUCTION, AppAttest.ANDROID_APP_ID_HASH, bytes32(0)
            )
        );
    }
}

contract FaceMatchHarness is SubVerifier {
    constructor() SubVerifier(msg.sender, RootVerifier(address(1)), bytes32(0)) {}

    function verify(bytes calldata committedInputs) external pure {
        _verifyAadhaarFaceMatch(committedInputs);
    }
}

contract FixtureFaceMatchSubVerifier is SubVerifier {
    constructor(address admin, RootVerifier root) SubVerifier(admin, root, bytes32(0)) {}

    function _verifyAadhaarFaceMatch(bytes calldata committedInputs) internal pure override {
        (bytes32 rootKeyHash, Environment environment, bytes32 appIdHash, bytes32 integrityPublicKeyHash,) =
            InputsExtractor.readFacematchProofInputs(committedInputs);
        require(
            rootKeyHash == FIXTURE_ROOT_KEY_HASH && appIdHash == FIXTURE_APP_ID_HASH
                && integrityPublicKeyHash == bytes32(0) && environment == Environment.PRODUCTION,
            "Invalid Aadhaar face match"
        );
    }
}
