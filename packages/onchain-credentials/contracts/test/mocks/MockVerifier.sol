// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, FaceMatchMode, OS, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "@registry/IRootVerifier.sol";

contract MockVerifierHelper is IVerifierHelper {
    BoundData internal _boundData;
    bool public ageOk = true;
    bool public nationalityInOk = true;
    bool public nationalityOutOk = true;
    bool public faceMatchOk = true;
    bool public sanctionsOk = true;
    bool public scopesOk = true;
    bool internal expectedSanctionsStrict;
    bool internal checkSanctionsStrict;
    uint8 internal expectedMinAge;
    bool internal checkMinAge;
    bytes32 internal expectedNationalitiesInHash;
    bool internal checkNationalitiesIn;
    bytes32 internal expectedNationalitiesOutHash;
    bool internal checkNationalitiesOut;
    FaceMatchMode internal expectedFaceMatchMode;
    bool internal checkFaceMatchMode;
    uint256 public proofTimestamp;
    bytes32 internal expectedScopeHash;
    bytes32 internal expectedSubscopeHash;
    bool internal checkScopes;

    function setBoundData(address senderAddress, uint256 chainId, string memory customData) external {
        _boundData = BoundData({senderAddress: senderAddress, chainId: chainId, customData: customData});
    }

    function setAgeOk(bool value) external {
        ageOk = value;
    }

    function setNationalityInOk(bool value) external {
        nationalityInOk = value;
    }

    function setNationalityOutOk(bool value) external {
        nationalityOutOk = value;
    }

    function setFaceMatchOk(bool value) external {
        faceMatchOk = value;
    }

    function setSanctionsOk(bool value) external {
        sanctionsOk = value;
    }

    function setExpectedSanctionsStrict(bool value) external {
        expectedSanctionsStrict = value;
        checkSanctionsStrict = true;
    }

    function setExpectedMinAge(uint8 value) external {
        expectedMinAge = value;
        checkMinAge = true;
    }

    function setExpectedNationalitiesIn(string[] memory countries) external {
        expectedNationalitiesInHash = keccak256(abi.encode(countries));
        checkNationalitiesIn = true;
    }

    function setExpectedNationalitiesOut(string[] memory countries) external {
        expectedNationalitiesOutHash = keccak256(abi.encode(countries));
        checkNationalitiesOut = true;
    }

    function setExpectedFaceMatchMode(FaceMatchMode value) external {
        expectedFaceMatchMode = value;
        checkFaceMatchMode = true;
    }

    function setScopesOk(bool value) external {
        scopesOk = value;
    }

    function setProofTimestamp(uint256 value) external {
        proofTimestamp = value;
    }

    function setExpectedScopes(string memory scope, string memory subscope) external {
        expectedScopeHash = keccak256(bytes(scope));
        expectedSubscopeHash = keccak256(bytes(subscope));
        checkScopes = true;
    }

    function getBoundData(bytes calldata) external view returns (BoundData memory) {
        return _boundData;
    }

    function isAgeAboveOrEqual(uint8 minAge, bytes calldata) external view returns (bool) {
        if (checkMinAge) {
            require(minAge == expectedMinAge, "MockVerifierHelper: wrong minimum age");
        }
        return ageOk;
    }

    function isNationalityIn(string[] memory countries, bytes calldata) external view returns (bool) {
        if (checkNationalitiesIn) {
            require(
                keccak256(abi.encode(countries)) == expectedNationalitiesInHash,
                "MockVerifierHelper: wrong included nationalities"
            );
        }
        return nationalityInOk;
    }

    function isNationalityOut(string[] memory countries, bytes calldata) external view returns (bool) {
        if (checkNationalitiesOut) {
            require(
                keccak256(abi.encode(countries)) == expectedNationalitiesOutHash,
                "MockVerifierHelper: wrong excluded nationalities"
            );
        }
        return nationalityOutOk;
    }

    function isFaceMatchVerified(FaceMatchMode faceMatchMode, OS os, bytes calldata) external view returns (bool) {
        if (checkFaceMatchMode) {
            require(
                faceMatchMode == expectedFaceMatchMode && os == OS.ANY, "MockVerifierHelper: wrong face match arguments"
            );
        }
        return faceMatchOk;
    }

    function enforceSanctionsRoot(uint256, bool isStrict, bytes calldata) external view {
        require(sanctionsOk, "MockVerifierHelper: sanctions root invalid");
        if (checkSanctionsStrict) {
            require(isStrict == expectedSanctionsStrict, "MockVerifierHelper: wrong sanctions strictness");
        }
    }

    function verifyScopes(bytes32[] calldata, string calldata scope, string calldata subscope)
        external
        view
        returns (bool)
    {
        if (!scopesOk) return false;
        if (checkScopes) {
            return keccak256(bytes(scope)) == expectedScopeHash && keccak256(bytes(subscope)) == expectedSubscopeHash;
        }
        return true;
    }

    function getProofTimestamp(bytes32[] calldata) external view returns (uint256) {
        return proofTimestamp;
    }
}

contract MockRootVerifier is IRootVerifier {
    MockVerifierHelper public immutable helper;
    bool public valid = true;
    bytes32 public nullifier = bytes32(uint256(0xA11CE));

    constructor(MockVerifierHelper _helper) {
        helper = _helper;
    }

    function setValid(bool value) external {
        valid = value;
    }

    function setNullifier(bytes32 value) external {
        nullifier = value;
    }

    function verify(ProofVerificationParams calldata) external view returns (bool, bytes32, IVerifierHelper) {
        return (valid, nullifier, helper);
    }
}
