// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {RootVerifier} from "../src/RootVerifier.sol";
import {SubVerifier} from "../src/SubVerifier.sol";
import {VerificationMethods} from "../src/lib/VerificationMethods.sol";
import {FaceMatch} from "../src/lib/AttestedId.sol";
import {AppAttest} from "../src/lib/Constants.sol";
import {Environment} from "../src/lib/Types.sol";

contract AadhaarVerificationTest is Test {
    uint256 constant UIDAI_AADHAAR = 101;
    FaceMatchHarness harness = new FaceMatchHarness();

    function _facematchEntry(bytes32 rootKeyHash, Environment environment, bytes32 appIdHash, bytes32 integrityKeyHash)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(
            uint8(10), uint16(130), rootKeyHash, uint8(environment), appIdHash, integrityKeyHash, uint8(1), bytes32(0)
        );
    }

    function test_AadhaarIsGovernmentSignedAndVerifiable() public pure {
        assertTrue(VerificationMethods.isVerifiable(UIDAI_AADHAAR));
        assertEq(VerificationMethods.tierOf(UIDAI_AADHAAR), 1);
        assertTrue(VerificationMethods.isAllowed(UIDAI_AADHAAR, new uint256[](0)));
        uint256[] memory chipOnly = new uint256[](1);
        chipOnly[0] = 100;
        assertFalse(VerificationMethods.isAllowed(UIDAI_AADHAAR, chipOnly));
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
