// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";

interface IVerifierHelper {
    function getBoundData(bytes calldata committedInputs) external view returns (BoundData memory);
    function isAgeAboveOrEqual(uint8 minAge, bytes calldata committedInputs) external view returns (bool);
    function isNationalityOut(string[] memory countryList, bytes calldata committedInputs) external view returns (bool);
    function enforceSanctionsRoot(uint256 currentTimestamp, bool isStrict, bytes calldata committedInputs) external view;
    function verifyScopes(bytes32[] calldata publicInputs, string calldata scope, string calldata subscope)
        external
        view
        returns (bool);
    function getProofTimestamp(bytes32[] calldata publicInputs) external view returns (uint256);
}

interface IRootVerifier {
    function verify(ProofVerificationParams calldata params)
        external
        view
        returns (bool valid, bytes32 uniqueIdentifier, IVerifierHelper helper);
}
