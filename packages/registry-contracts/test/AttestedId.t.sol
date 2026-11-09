pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/RootRegistry.sol";
import "../src/RootVerifier.sol";
import "../src/SubVerifier.sol";
import "../src/VerifierHelper.sol";
import {AttestedId} from "../src/lib/AttestedId.sol";
import {InputsExtractor} from "../src/lib/InputsExtractor.sol";
import {AppAttest, CommittedInputLen} from "../src/lib/Constants.sol";
import {CredentialScheme} from "../src/lib/Credentials.sol";
import {ProofType, Environment, FaceMatchMode, OS} from "../src/lib/Types.sol";

contract AttestedIdHarness {
    function getAttestedIdProofInputs(bytes calldata committedInputs)
        external
        pure
        returns (bytes32, Environment, bytes32, bytes32, FaceMatchMode)
    {
        return InputsExtractor.getAttestedIdProofInputs(committedInputs);
    }

    function containsProofType(bytes calldata committedInputs, ProofType proofType) external pure returns (bool) {
        return InputsExtractor.containsProofType(committedInputs, proofType);
    }

    function isValid(
        uint256 scheme,
        bytes32 rootKeyHash,
        Environment environment,
        bytes32 appIdHash,
        bytes32 integrityPublicKeyHash,
        FaceMatchMode mode
    ) external pure returns (bool) {
        return AttestedId.isValid(scheme, rootKeyHash, environment, appIdHash, integrityPublicKeyHash, mode);
    }
}

contract SubVerifierHarness is SubVerifier {
    constructor() SubVerifier(address(0x1), RootVerifier(address(0x2)), bytes32(0)) {}

    function verifyDeviceAttestation(uint256 credentialScheme, bytes calldata committedInputs) external pure {
        _verifyDeviceAttestation(credentialScheme, committedInputs);
    }
}

contract AttestedIdTest is Test {
    AttestedIdHarness public harness;
    SubVerifierHarness public subVerifier;
    VerifierHelper public helper;

    function setUp() public {
        harness = new AttestedIdHarness();
        subVerifier = new SubVerifierHarness();
        helper = new VerifierHelper(new RootRegistry(address(0x1), address(0x2)));
    }

    function attestationPayload(
        bytes32 rootKeyHash,
        Environment environment,
        bytes32 appIdHash,
        bytes32 integrityPublicKeyHash,
        FaceMatchMode mode
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(rootKeyHash, uint8(environment), appIdHash, integrityPublicKeyHash, uint8(mode));
    }

    function entry(ProofType proofType, bytes memory payload) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(proofType), uint16(payload.length), payload);
    }

    function iosPayload() internal pure returns (bytes memory) {
        return attestationPayload(
            AppAttest.APPLE_ROOT_KEY_HASH,
            Environment.PRODUCTION,
            AppAttest.IOS_APP_ID_HASH,
            bytes32(0),
            FaceMatchMode.STRICT
        );
    }

    function androidPayload(bytes32 rootKeyHash) internal pure returns (bytes memory) {
        return attestationPayload(
            rootKeyHash,
            Environment.PRODUCTION,
            AppAttest.ANDROID_APP_ID_HASH,
            AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH,
            FaceMatchMode.STRICT
        );
    }

    function ageEntry() internal pure returns (bytes memory) {
        return entry(ProofType.AGE, abi.encodePacked(uint8(18), uint8(0)));
    }

    // ---- Types ----

    function testProofTypeAndLength() public pure {
        assertEq(uint256(ProofType.FACEMATCH), 10);
        assertEq(uint256(ProofType.ATTESTED_ID), 11);
        assertEq(CommittedInputLen.ATTESTED_ID, 98);
    }

    // ---- Extractor ----

    function testExtractorReadsFirstEntry() public view {
        bytes memory inputs = bytes.concat(entry(ProofType.ATTESTED_ID, iosPayload()), ageEntry());
        (bytes32 root, Environment env, bytes32 app, bytes32 integrity, FaceMatchMode mode) =
            harness.getAttestedIdProofInputs(inputs);
        assertEq(root, AppAttest.APPLE_ROOT_KEY_HASH);
        assertEq(uint256(env), uint256(Environment.PRODUCTION));
        assertEq(app, AppAttest.IOS_APP_ID_HASH);
        assertEq(integrity, bytes32(0));
        assertEq(uint256(mode), uint256(FaceMatchMode.STRICT));
    }

    function testExtractorReadsAndroidFields() public view {
        bytes memory inputs = entry(ProofType.ATTESTED_ID, androidPayload(AppAttest.GOOGLE_ECDSA_ROOT_KEY_HASH));
        (bytes32 root,, bytes32 app, bytes32 integrity,) = harness.getAttestedIdProofInputs(inputs);
        assertEq(root, AppAttest.GOOGLE_ECDSA_ROOT_KEY_HASH);
        assertEq(app, AppAttest.ANDROID_APP_ID_HASH);
        assertEq(integrity, AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH);
    }

    function testExtractorRejectsNonFirstEntry() public {
        bytes memory inputs = bytes.concat(ageEntry(), entry(ProofType.ATTESTED_ID, iosPayload()));
        vm.expectRevert("Attested ID proof inputs not found");
        harness.getAttestedIdProofInputs(inputs);
    }

    function testExtractorRejectsAbsent() public {
        vm.expectRevert("Attested ID proof inputs not found");
        harness.getAttestedIdProofInputs(ageEntry());

        vm.expectRevert("Attested ID proof inputs not found");
        harness.getAttestedIdProofInputs("");

        vm.expectRevert("Attested ID proof inputs not found");
        harness.getAttestedIdProofInputs(entry(ProofType.FACEMATCH, iosPayload()));
    }

    function testExtractorRejectsWrongLength() public {
        vm.expectRevert("Invalid attested ID proof inputs length");
        harness.getAttestedIdProofInputs(entry(ProofType.ATTESTED_ID, bytes.concat(iosPayload(), hex"00")));

        bytes memory short = new bytes(97);
        vm.expectRevert("Invalid attested ID proof inputs length");
        harness.getAttestedIdProofInputs(entry(ProofType.ATTESTED_ID, short));

        // Declared length right, payload truncated
        bytes memory truncated = abi.encodePacked(uint8(ProofType.ATTESTED_ID), uint16(98), new bytes(50));
        vm.expectRevert("Invalid attested ID proof inputs length");
        harness.getAttestedIdProofInputs(truncated);
    }

    function testContainsProofType() public view {
        bytes memory inputs = bytes.concat(ageEntry(), entry(ProofType.ATTESTED_ID, iosPayload()));
        assertTrue(harness.containsProofType(inputs, ProofType.ATTESTED_ID));
        assertTrue(harness.containsProofType(inputs, ProofType.AGE));
        assertFalse(harness.containsProofType(inputs, ProofType.FACEMATCH));
        assertFalse(harness.containsProofType("", ProofType.ATTESTED_ID));
    }

    // ---- AttestedId.isValid ----

    function testIsValidIos() public view {
        assertTrue(
            harness.isValid(
                CredentialScheme.ATTESTED_CAPTURE_IOS,
                AppAttest.APPLE_ROOT_KEY_HASH,
                Environment.PRODUCTION,
                AppAttest.IOS_APP_ID_HASH,
                bytes32(0),
                FaceMatchMode.STRICT
            )
        );
    }

    function testIsValidAndroidBothRoots() public view {
        assertTrue(
            harness.isValid(
                CredentialScheme.ATTESTED_CAPTURE_ANDROID,
                AppAttest.GOOGLE_RSA_ROOT_KEY_HASH,
                Environment.PRODUCTION,
                AppAttest.ANDROID_APP_ID_HASH,
                AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH,
                FaceMatchMode.STRICT
            )
        );
        assertTrue(
            harness.isValid(
                CredentialScheme.ATTESTED_CAPTURE_ANDROID,
                AppAttest.GOOGLE_ECDSA_ROOT_KEY_HASH,
                Environment.PRODUCTION,
                AppAttest.ANDROID_APP_ID_HASH,
                AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH,
                FaceMatchMode.STRICT
            )
        );
    }

    function testIsValidIosRejectsWrongFields() public view {
        uint256 s = CredentialScheme.ATTESTED_CAPTURE_IOS;
        bytes32 root = AppAttest.APPLE_ROOT_KEY_HASH;
        bytes32 app = AppAttest.IOS_APP_ID_HASH;
        Environment prod = Environment.PRODUCTION;
        FaceMatchMode strict = FaceMatchMode.STRICT;
        // Self-signed or other platform root
        assertFalse(harness.isValid(s, bytes32(uint256(1)), prod, app, 0, strict));
        assertFalse(harness.isValid(s, AppAttest.GOOGLE_RSA_ROOT_KEY_HASH, prod, app, 0, strict));
        // Wrong app
        assertFalse(harness.isValid(s, root, prod, AppAttest.ANDROID_APP_ID_HASH, 0, strict));
        assertFalse(harness.isValid(s, root, prod, bytes32(uint256(1)), 0, strict));
        // Non-zero integrity key
        assertFalse(harness.isValid(s, root, prod, app, AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH, strict));
        // Dev environment
        assertFalse(harness.isValid(s, root, Environment.DEVELOPMENT, app, 0, strict));
        // Non strict mode
        assertFalse(harness.isValid(s, root, prod, app, 0, FaceMatchMode.REGULAR));
        assertFalse(harness.isValid(s, root, prod, app, 0, FaceMatchMode.NONE));
    }

    function testIsValidAndroidRejectsWrongFields() public view {
        uint256 s = CredentialScheme.ATTESTED_CAPTURE_ANDROID;
        bytes32 root = AppAttest.GOOGLE_RSA_ROOT_KEY_HASH;
        bytes32 app = AppAttest.ANDROID_APP_ID_HASH;
        bytes32 key = AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH;
        Environment prod = Environment.PRODUCTION;
        FaceMatchMode strict = FaceMatchMode.STRICT;
        assertFalse(harness.isValid(s, bytes32(uint256(1)), prod, app, key, strict));
        assertFalse(harness.isValid(s, AppAttest.APPLE_ROOT_KEY_HASH, prod, app, key, strict));
        assertFalse(harness.isValid(s, root, prod, AppAttest.IOS_APP_ID_HASH, key, strict));
        assertFalse(harness.isValid(s, root, prod, app, bytes32(0), strict));
        assertFalse(harness.isValid(s, root, prod, app, bytes32(uint256(1)), strict));
        assertFalse(harness.isValid(s, root, Environment.DEVELOPMENT, app, key, strict));
        assertFalse(harness.isValid(s, root, prod, app, key, FaceMatchMode.REGULAR));
    }

    function testIsValidRejectsOtherSchemes() public view {
        uint256[4] memory schemes = [
            CredentialScheme.ATTESTED_CHIP_READ_IOS,
            CredentialScheme.ATTESTED_CHIP_READ_ANDROID,
            CredentialScheme.ICAO_CHIP,
            uint256(299)
        ];
        for (uint256 i = 0; i < schemes.length; i++) {
            assertFalse(
                harness.isValid(
                    schemes[i],
                    AppAttest.APPLE_ROOT_KEY_HASH,
                    Environment.PRODUCTION,
                    AppAttest.IOS_APP_ID_HASH,
                    bytes32(0),
                    FaceMatchMode.STRICT
                )
            );
            assertFalse(
                harness.isValid(
                    schemes[i],
                    AppAttest.GOOGLE_RSA_ROOT_KEY_HASH,
                    Environment.PRODUCTION,
                    AppAttest.ANDROID_APP_ID_HASH,
                    AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH,
                    FaceMatchMode.STRICT
                )
            );
        }
    }

    // ---- SubVerifier policy ----

    function testSubVerifierAcceptsValidDeviceAttestation() public view {
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.ATTESTED_CAPTURE_IOS, bytes.concat(entry(ProofType.ATTESTED_ID, iosPayload()), ageEntry())
        );
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.ATTESTED_CAPTURE_ANDROID,
            entry(ProofType.ATTESTED_ID, androidPayload(AppAttest.GOOGLE_RSA_ROOT_KEY_HASH))
        );
    }

    function testSubVerifierRejectsDeviceTierWithoutAttestationFirst() public {
        vm.expectRevert("Attested ID proof inputs not found");
        subVerifier.verifyDeviceAttestation(CredentialScheme.ATTESTED_CAPTURE_IOS, ageEntry());

        vm.expectRevert("Attested ID proof inputs not found");
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.ATTESTED_CAPTURE_IOS, bytes.concat(ageEntry(), entry(ProofType.ATTESTED_ID, iosPayload()))
        );

        // A FACEMATCH entry is not a device attestation of the ID
        vm.expectRevert("Attested ID proof inputs not found");
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.ATTESTED_CAPTURE_IOS, entry(ProofType.FACEMATCH, iosPayload())
        );
    }

    function testSubVerifierRejectsInvalidDeviceAttestation() public {
        bytes memory selfSigned = entry(
            ProofType.ATTESTED_ID,
            attestationPayload(
                bytes32(uint256(0xbad)),
                Environment.PRODUCTION,
                AppAttest.IOS_APP_ID_HASH,
                bytes32(0),
                FaceMatchMode.STRICT
            )
        );
        vm.expectRevert("Invalid device attestation");
        subVerifier.verifyDeviceAttestation(CredentialScheme.ATTESTED_CAPTURE_IOS, selfSigned);

        // Platform mismatch between scheme and attestation
        vm.expectRevert("Invalid device attestation");
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.ATTESTED_CAPTURE_ANDROID, entry(ProofType.ATTESTED_ID, iosPayload())
        );

        // Reserved schemes have no circuit yet
        vm.expectRevert("Invalid device attestation");
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.ATTESTED_CHIP_READ_IOS, entry(ProofType.ATTESTED_ID, iosPayload())
        );
        vm.expectRevert("Invalid device attestation");
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.ATTESTED_CHIP_READ_ANDROID,
            entry(ProofType.ATTESTED_ID, androidPayload(AppAttest.GOOGLE_RSA_ROOT_KEY_HASH))
        );
    }

    function testSubVerifierSignedTierRejectsAttestedIdAnywhere() public {
        // Chip proofs keep working, with or without a face match
        subVerifier.verifyDeviceAttestation(CredentialScheme.ICAO_CHIP, ageEntry());
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.ICAO_CHIP, bytes.concat(ageEntry(), entry(ProofType.FACEMATCH, iosPayload()))
        );
        subVerifier.verifyDeviceAttestation(CredentialScheme.ICAO_CHIP, "");

        vm.expectRevert("Unexpected device attestation");
        subVerifier.verifyDeviceAttestation(CredentialScheme.ICAO_CHIP, entry(ProofType.ATTESTED_ID, iosPayload()));

        vm.expectRevert("Unexpected device attestation");
        subVerifier.verifyDeviceAttestation(
            CredentialScheme.JPKI, bytes.concat(ageEntry(), entry(ProofType.ATTESTED_ID, iosPayload()))
        );
    }

    // ---- VerifierHelper.isFaceMatchVerified ----

    function testFaceMatchFallsBackToAttestedId() public view {
        bytes memory ios = bytes.concat(entry(ProofType.ATTESTED_ID, iosPayload()), ageEntry());
        assertTrue(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.IOS, ios));
        assertTrue(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANY, ios));
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANDROID, ios));
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.REGULAR, OS.IOS, ios));

        bytes memory android = entry(ProofType.ATTESTED_ID, androidPayload(AppAttest.GOOGLE_ECDSA_ROOT_KEY_HASH));
        assertTrue(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANDROID, android));
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.IOS, android));
    }

    function testFaceMatchPrefersFacematchEntry() public view {
        bytes memory regularFacematch = entry(
            ProofType.FACEMATCH,
            attestationPayload(
                AppAttest.APPLE_ROOT_KEY_HASH,
                Environment.PRODUCTION,
                AppAttest.IOS_APP_ID_HASH,
                bytes32(0),
                FaceMatchMode.REGULAR
            )
        );
        bytes memory inputs = bytes.concat(entry(ProofType.ATTESTED_ID, iosPayload()), regularFacematch);
        assertTrue(helper.isFaceMatchVerified(FaceMatchMode.REGULAR, OS.IOS, inputs));
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.IOS, inputs));
    }

    function testFaceMatchUnchangedForFacematchOnly() public view {
        bytes memory inputs = bytes.concat(ageEntry(), entry(ProofType.FACEMATCH, iosPayload()));
        assertTrue(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.IOS, inputs));
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANDROID, inputs));
    }

    function testFaceMatchRevertsWithoutEvidence() public {
        vm.expectRevert("Facematch proof inputs not found");
        helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.ANY, ageEntry());
    }

    function testFaceMatchRejectsDevAttestedId() public view {
        bytes memory inputs = entry(
            ProofType.ATTESTED_ID,
            attestationPayload(
                AppAttest.APPLE_ROOT_KEY_HASH,
                Environment.DEVELOPMENT,
                AppAttest.IOS_APP_ID_HASH,
                bytes32(0),
                FaceMatchMode.STRICT
            )
        );
        assertFalse(helper.isFaceMatchVerified(FaceMatchMode.STRICT, OS.IOS, inputs));
    }
}
