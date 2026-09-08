// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {FaceMatchMode, OS} from "@registry/lib/Types.sol";
import {IVerifierHelper} from "@registry/IRootVerifier.sol";

/**
 * @title  IExtendedVerifierHelper
 * @notice The registry's stable IVerifierHelper declares only a subset of the
 *         predicate views its deployed VerifierHelper implements. This
 *         attest-side extension declares the rest of the ones the policy
 *         evaluator needs, so it can call the same helper address without any
 *         registry contract changing. Date bounds are unix timestamps in
 *         seconds, matching the helper's comparison functions.
 */
interface IExtendedVerifierHelper is IVerifierHelper {
    function isAgeBetween(uint8 minAge, uint8 maxAge, bytes calldata committedInputs) external view returns (bool);
    function isAgeBelowOrEqual(uint8 maxAge, bytes calldata committedInputs) external view returns (bool);
    function isBirthdateAfterOrEqual(uint256 minDate, bytes calldata committedInputs) external view returns (bool);
    function isBirthdateBetween(uint256 minDate, uint256 maxDate, bytes calldata committedInputs)
        external
        view
        returns (bool);
    function isBirthdateBeforeOrEqual(uint256 maxDate, bytes calldata committedInputs) external view returns (bool);
    function isExpiryDateAfterOrEqual(uint256 minDate, bytes calldata committedInputs) external view returns (bool);
    function isExpiryDateBetween(uint256 minDate, uint256 maxDate, bytes calldata committedInputs)
        external
        view
        returns (bool);
    function isExpiryDateBeforeOrEqual(uint256 maxDate, bytes calldata committedInputs) external view returns (bool);
    function isNationalityIn(string[] memory countryList, bytes calldata committedInputs) external view returns (bool);
    function isIssuingCountryIn(string[] memory countryList, bytes calldata committedInputs)
        external
        view
        returns (bool);
    function isIssuingCountryOut(string[] memory countryList, bytes calldata committedInputs)
        external
        view
        returns (bool);
    function isFaceMatchVerified(FaceMatchMode faceMatchMode, OS os, bytes calldata committedInputs)
        external
        view
        returns (bool);
}
