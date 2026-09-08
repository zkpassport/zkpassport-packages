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
 *         registry contract changing.
 */
interface IExtendedVerifierHelper is IVerifierHelper {
    function isNationalityIn(string[] memory countryList, bytes calldata committedInputs) external view returns (bool);
    function isFaceMatchVerified(FaceMatchMode faceMatchMode, OS os, bytes calldata committedInputs)
        external
        view
        returns (bool);
}
