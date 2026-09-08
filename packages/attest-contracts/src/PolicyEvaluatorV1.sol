// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {IVerifierHelper} from "@registry/IRootVerifier.sol";
import {IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @title  PolicyEvaluatorV1
 * @notice First-generation requirements schema: one-per-document uniqueness by
 *         nullifier type, minimum age, jurisdiction exclusion, and strict
 *         sanctions checking. Stateless — policies store their requirements as
 *         abi-encoded bytes and share this single deployment.
 */
contract PolicyEvaluatorV1 is IPolicyEvaluator {
    struct PolicyRequirements {
        NullifierType uniqueIdentifierType;
        uint8 minAge;
        bool sanctionsCheck;
        string[] excludedCountries;
    }

    error PolicyEvaluator__InvalidNullifierType();
    error PolicyEvaluator__InvalidCountryList();
    error PolicyEvaluator__WrongNullifierType();
    error PolicyEvaluator__AgeBelowMinimum();
    error PolicyEvaluator__ExcludedJurisdiction();

    function schemaVersion() external pure returns (uint256) {
        return 1;
    }

    /// @notice Typed decode for off-chain consumers (request building); the
    ///         return type is version-specific, so this is not part of
    ///         IPolicyEvaluator
    function decodeRequirements(bytes calldata requirements) public pure returns (PolicyRequirements memory) {
        return abi.decode(requirements, (PolicyRequirements));
    }

    function validateRequirements(bytes calldata requirements) external pure {
        PolicyRequirements memory r = decodeRequirements(requirements);
        if (
            r.uniqueIdentifierType != NullifierType.NONE_NULLIFIER
                && r.uniqueIdentifierType != NullifierType.NON_SALTED_NULLIFIER
                && r.uniqueIdentifierType != NullifierType.SALTED_NULLIFIER
        ) revert PolicyEvaluator__InvalidNullifierType();
        _validateCountryList(r.excludedCountries);
    }

    /// @dev The verifier helper's exclusion check needs the exact, alphabetically
    ///      sorted list committed in the proof, and circuit country codes are ISO
    ///      3166-1 alpha-3. A lowercase or padded entry round-trips consistently
    ///      but never matches a real nationality, silently disabling the
    ///      exclusion, and an unsorted list breaks the circuit's non-membership
    ///      precondition — so reject both when the policy is created. Strictly
    ///      ascending order also rules out duplicates.
    function _validateCountryList(string[] memory countries) internal pure {
        uint24 previous = 0;
        for (uint256 i = 0; i < countries.length; i++) {
            bytes memory country = bytes(countries[i]);
            if (country.length != 3) revert PolicyEvaluator__InvalidCountryList();
            uint24 value = 0;
            for (uint256 j = 0; j < 3; j++) {
                if (country[j] < "A" || country[j] > "Z") revert PolicyEvaluator__InvalidCountryList();
                value = (value << 8) | uint24(uint8(country[j]));
            }
            if (i > 0 && value <= previous) revert PolicyEvaluator__InvalidCountryList();
            previous = value;
        }
    }

    function validate(
        bytes calldata requirements,
        IVerifierHelper helper,
        bytes calldata committedInputs,
        bytes32[] calldata publicInputs
    ) external view returns (bool unique) {
        PolicyRequirements memory r = decodeRequirements(requirements);

        unique = r.uniqueIdentifierType != NullifierType.NONE_NULLIFIER;
        if (unique) {
            NullifierType nullifierType = NullifierType(uint256(publicInputs[publicInputs.length - 3]));
            if (nullifierType != r.uniqueIdentifierType) revert PolicyEvaluator__WrongNullifierType();
        }

        if (r.minAge > 0 && !helper.isAgeAboveOrEqual(r.minAge, committedInputs)) {
            revert PolicyEvaluator__AgeBelowMinimum();
        }
        if (r.excludedCountries.length > 0 && !helper.isNationalityOut(r.excludedCountries, committedInputs)) {
            revert PolicyEvaluator__ExcludedJurisdiction();
        }
        if (r.sanctionsCheck) {
            helper.enforceSanctionsRoot(block.timestamp, true, committedInputs);
        }
    }
}
