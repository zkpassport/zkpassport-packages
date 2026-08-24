// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "../../src/interfaces/IRootVerifier.sol";

contract MockVerifierHelper is IVerifierHelper {
    BoundData internal _boundData;
    bool public ageOk = true;
    bool public nationalityOk = true;
    bool public sanctionsOk = true;
    bool public scopesOk = true;
    uint256 public proofTimestamp;

    function setBoundData(address senderAddress, uint256 chainId, string memory customData) external {
        _boundData = BoundData({senderAddress: senderAddress, chainId: chainId, customData: customData});
    }

    function setAgeOk(bool value) external {
        ageOk = value;
    }

    function setNationalityOk(bool value) external {
        nationalityOk = value;
    }

    function setSanctionsOk(bool value) external {
        sanctionsOk = value;
    }

    function setScopesOk(bool value) external {
        scopesOk = value;
    }

    function setProofTimestamp(uint256 value) external {
        proofTimestamp = value;
    }

    function getBoundData(bytes calldata) external view returns (BoundData memory) {
        return _boundData;
    }

    function isAgeAboveOrEqual(uint8, bytes calldata) external view returns (bool) {
        return ageOk;
    }

    function isNationalityOut(string[] memory, bytes calldata) external view returns (bool) {
        return nationalityOk;
    }

    function enforceSanctionsRoot(uint256, bool, bytes calldata) external view {
        require(sanctionsOk, "MockVerifierHelper: sanctions root invalid");
    }

    function verifyScopes(bytes32[] calldata, string calldata, string calldata) external view returns (bool) {
        return scopesOk;
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
