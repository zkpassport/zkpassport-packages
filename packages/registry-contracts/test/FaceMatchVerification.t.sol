// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/RootRegistry.sol";
import "../src/VerifierHelper.sol";
import {MockRegistry} from "./MockRegistry.sol";
import {AppAttest, RegistryID} from "../src/lib/Constants.sol";
import {FaceMatchMode, OS, ProofType, Environment} from "../src/lib/Types.sol";
import {InputsExtractor} from "../src/lib/InputsExtractor.sol";

contract InputsExtractorHarness {
    function getRevocationRoot(bytes calldata committedInputs) external pure returns (bytes32 revocationRoot) {
        (,,,,, revocationRoot) = InputsExtractor.getFacematchProofInputs(committedInputs);
    }
}

contract FaceMatchVerificationTest is Test {
    VerifierHelper public helper;
    MockRegistry public revocationRegistry;
    bytes32 constant REVOCATION_ROOT = keccak256("revocation-root");

    function setUp() public {
        RootRegistry rootRegistry = new RootRegistry(address(this), address(0));
        revocationRegistry = new MockRegistry(true);
        rootRegistry.addRegistry(RegistryID.ATTESTATION_REVOCATION, revocationRegistry);
        helper = new VerifierHelper(rootRegistry);
    }

    function facematchInputs(
        bytes32 rootKeyHash,
        bytes32 appIdHash,
        bytes32 integrityPublicKeyHash,
        bytes32 revocationRoot
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(ProofType.FACEMATCH),
            uint16(130),
            rootKeyHash,
            uint8(Environment.PRODUCTION),
            appIdHash,
            integrityPublicKeyHash,
            uint8(FaceMatchMode.STRICT),
            revocationRoot
        );
    }

    function androidInputs(bytes32 revocationRoot) internal pure returns (bytes memory) {
        return facematchInputs(
            AppAttest.GOOGLE_ECDSA_ROOT_KEY_HASH,
            AppAttest.ANDROID_APP_ID_HASH,
            AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH,
            revocationRoot
        );
    }

    function iosInputs(bytes32 revocationRoot) internal pure returns (bytes memory) {
        return facematchInputs(AppAttest.APPLE_ROOT_KEY_HASH, AppAttest.IOS_APP_ID_HASH, bytes32(0), revocationRoot);
    }

    function testExtractsRevocationRoot() public {
        InputsExtractorHarness harness = new InputsExtractorHarness();
        assertEq(harness.getRevocationRoot(androidInputs(REVOCATION_ROOT)), REVOCATION_ROOT);
    }

    function testAcceptsAndroidProofWithValidRevocationRoot() public view {
        assertTrue(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANDROID, androidInputs(REVOCATION_ROOT)));
        assertTrue(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANY, androidInputs(REVOCATION_ROOT)));
    }

    function testRejectsAndroidProofWithStaleRevocationRoot() public {
        revocationRegistry.setShouldReturnValid(false);
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANDROID, androidInputs(REVOCATION_ROOT)));
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANY, androidInputs(REVOCATION_ROOT)));
    }

    function testAcceptsIosProofWithoutRevocationRoot() public {
        revocationRegistry.setShouldReturnValid(false);
        assertTrue(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.IOS, iosInputs(bytes32(0))));
    }

    function testRejectsIosProofWithRevocationRoot() public view {
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.IOS, iosInputs(REVOCATION_ROOT)));
    }

    function testRejectsLegacyLayout() public {
        bytes memory legacy = abi.encodePacked(
            uint8(ProofType.FACEMATCH),
            uint16(98),
            AppAttest.APPLE_ROOT_KEY_HASH,
            uint8(Environment.PRODUCTION),
            AppAttest.IOS_APP_ID_HASH,
            bytes32(0),
            uint8(FaceMatchMode.STRICT)
        );
        vm.expectRevert("Facematch proof inputs not found");
        helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.IOS, legacy);
    }
}
