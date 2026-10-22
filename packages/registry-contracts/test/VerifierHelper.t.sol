pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/RootRegistry.sol";
import "../src/VerifierHelper.sol";
import {NullifierType} from "../src/lib/Types.sol";
import {CredentialScheme, CredentialTier} from "../src/lib/Credentials.sol";

contract VerifierHelperTest is Test {
    VerifierHelper public helper;

    function setUp() public {
        helper = new VerifierHelper(new RootRegistry(address(0x1), address(0x2)));
    }

    function publicInputsWithNullifierType(NullifierType nullifierType) internal pure returns (bytes32[] memory) {
        return publicInputsWithNullifierType(nullifierType, bytes32(uint256(1)));
    }

    function publicInputsWithNullifierType(NullifierType nullifierType, bytes32 nullifier)
        internal
        pure
        returns (bytes32[] memory)
    {
        return publicInputsWith(nullifierType, nullifier, CredentialScheme.ICAO_CHIP);
    }

    function publicInputsWithScheme(uint256 scheme) internal pure returns (bytes32[] memory) {
        return publicInputsWith(NullifierType.SALTED_NULLIFIER, bytes32(uint256(1)), scheme);
    }

    function publicInputsWith(NullifierType nullifierType, bytes32 nullifier, uint256 scheme)
        internal
        pure
        returns (bytes32[] memory)
    {
        bytes32[] memory publicInputs = new bytes32[](9);
        publicInputs[publicInputs.length - 4] = bytes32(uint256(nullifierType));
        publicInputs[publicInputs.length - 3] = nullifier;
        publicInputs[publicInputs.length - 1] = bytes32(scheme);
        return publicInputs;
    }

    function policy(uint256 a) internal pure returns (uint256[] memory allowed) {
        allowed = new uint256[](1);
        allowed[0] = a;
    }

    function policy(uint256 a, uint256 b) internal pure returns (uint256[] memory allowed) {
        allowed = new uint256[](2);
        allowed[0] = a;
        allowed[1] = b;
    }

    function testGetCredentialSchemeAndTier() public view {
        bytes32[] memory chip = publicInputsWithScheme(CredentialScheme.ICAO_CHIP);
        assertEq(helper.getCredentialScheme(chip), CredentialScheme.ICAO_CHIP);
        assertEq(helper.getCredentialTier(chip), CredentialTier.GOVERNMENT_SIGNED);

        bytes32[] memory camera = publicInputsWithScheme(CredentialScheme.ATTESTED_CAPTURE_ANDROID);
        assertEq(helper.getCredentialScheme(camera), CredentialScheme.ATTESTED_CAPTURE_ANDROID);
        assertEq(helper.getCredentialTier(camera), CredentialTier.DEVICE_ATTESTED);
    }

    function testEmptyPolicyAcceptsSignedCredentialsOnly() public view {
        uint256[] memory none = new uint256[](0);
        assertTrue(helper.isCredentialAllowed(none, publicInputsWithScheme(CredentialScheme.ICAO_CHIP)));
        assertTrue(helper.isCredentialAllowed(none, publicInputsWithScheme(CredentialScheme.JPKI)));
        assertFalse(helper.isCredentialAllowed(none, publicInputsWithScheme(CredentialScheme.ATTESTED_CAPTURE_IOS)));
    }

    function testPolicyEntryIsAWholeTierOrOneScheme() public view {
        uint256[] memory allowed = policy(CredentialTier.GOVERNMENT_SIGNED, CredentialScheme.ATTESTED_CAPTURE_IOS);
        assertTrue(helper.isCredentialAllowed(allowed, publicInputsWithScheme(CredentialScheme.ISO_MDOC)));
        assertTrue(helper.isCredentialAllowed(allowed, publicInputsWithScheme(CredentialScheme.ATTESTED_CAPTURE_IOS)));
        assertFalse(
            helper.isCredentialAllowed(allowed, publicInputsWithScheme(CredentialScheme.ATTESTED_CAPTURE_ANDROID))
        );

        uint256[] memory cameraOnly = policy(CredentialTier.DEVICE_ATTESTED);
        assertFalse(helper.isCredentialAllowed(cameraOnly, publicInputsWithScheme(CredentialScheme.ICAO_CHIP)));
        assertTrue(
            helper.isCredentialAllowed(cameraOnly, publicInputsWithScheme(CredentialScheme.ATTESTED_CAPTURE_ANDROID))
        );
    }

    function testEnforceCredentialAllowedReverts() public {
        uint256[] memory none = new uint256[](0);
        helper.enforceCredentialAllowed(none, publicInputsWithScheme(CredentialScheme.ICAO_CHIP));

        vm.expectRevert("Credential not allowed");
        helper.enforceCredentialAllowed(none, publicInputsWithScheme(CredentialScheme.ATTESTED_CAPTURE_IOS));
    }

    function testGetNullifierType() public view {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.SALTED_NULLIFIER);

        assertEq(uint256(helper.getNullifierType(publicInputs)), uint256(NullifierType.SALTED_NULLIFIER));
    }

    function testEnforceNullifierTypeAcceptsMatchingType() public view {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.SALTED_NULLIFIER);

        helper.enforceNullifierType(NullifierType.SALTED_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeRejectsMismatchedType() public {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER);

        vm.expectRevert("Invalid nullifier type");
        helper.enforceNullifierType(NullifierType.SALTED_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeAcceptsMockOfExpectedType() public view {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER);

        helper.enforceNullifierType(NullifierType.SALTED_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeRejectsMockOfAnotherType() public {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER);

        vm.expectRevert("Invalid nullifier type");
        helper.enforceNullifierType(NullifierType.SALTED_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeAcceptsMockWithHiddenNullifierForNone() public view {
        bytes32[] memory publicInputs =
            publicInputsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER, bytes32(0));

        helper.enforceNullifierType(NullifierType.NONE_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeRejectsMockWithNullifierForNone() public {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER);

        vm.expectRevert("Invalid nullifier type");
        helper.enforceNullifierType(NullifierType.NONE_NULLIFIER, publicInputs);
    }
}
