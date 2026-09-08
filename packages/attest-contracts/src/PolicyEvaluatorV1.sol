// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {FaceMatchMode, NullifierType, OS} from "@registry/lib/Types.sol";
import {IVerifierHelper} from "@registry/IRootVerifier.sol";
import {IExtendedVerifierHelper} from "./IExtendedVerifierHelper.sol";
import {IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @title  PolicyEvaluatorV1
 * @notice First-generation requirements schema: one-per-document uniqueness by
 *         nullifier type, age bounds, birthdate and document expiry windows,
 *         nationality and issuing-country allow/deny lists, FaceMatch, and
 *         strict sanctions checking. Stateless — policies store their
 *         requirements as abi-encoded bytes and share this single deployment.
 */
contract PolicyEvaluatorV1 is IPolicyEvaluator {
    /// @dev Numeric bounds are inclusive and 0 means unbounded on that side;
    ///      dates are unix timestamps in seconds. Strict comparisons and exact
    ///      matches are expressed through the inclusive bounds (equality is
    ///      min == max). Country lists are ISO 3166-1 alpha-3, strictly
    ///      ascending; an empty list disables that check.
    struct PolicyRequirements {
        NullifierType uniqueIdentifierType;
        uint8 minAge;
        uint8 maxAge;
        uint256 minBirthdate;
        uint256 maxBirthdate;
        uint256 minExpiryDate;
        uint256 maxExpiryDate;
        bool sanctionsCheck;
        FaceMatchMode faceMatchMode;
        string[] includedNationalities;
        string[] excludedNationalities;
        string[] includedIssuingCountries;
        string[] excludedIssuingCountries;
    }

    error PolicyEvaluator__InvalidNullifierType();
    error PolicyEvaluator__InvalidBounds();
    error PolicyEvaluator__InvalidCountryList();
    error PolicyEvaluator__WrongNullifierType();
    error PolicyEvaluator__AgeRequirementNotMet();
    error PolicyEvaluator__BirthdateRequirementNotMet();
    error PolicyEvaluator__ExpiryDateRequirementNotMet();
    error PolicyEvaluator__NationalityNotIncluded();
    error PolicyEvaluator__ExcludedNationality();
    error PolicyEvaluator__IssuingCountryNotIncluded();
    error PolicyEvaluator__ExcludedIssuingCountry();
    error PolicyEvaluator__FaceMatchRequirementNotMet();

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
        if (r.minAge > 0 && r.maxAge > 0 && r.minAge > r.maxAge) revert PolicyEvaluator__InvalidBounds();
        if (r.minBirthdate > 0 && r.maxBirthdate > 0 && r.minBirthdate > r.maxBirthdate) {
            revert PolicyEvaluator__InvalidBounds();
        }
        if (r.minExpiryDate > 0 && r.maxExpiryDate > 0 && r.minExpiryDate > r.maxExpiryDate) {
            revert PolicyEvaluator__InvalidBounds();
        }
        _validateCountryList(r.includedNationalities);
        _validateCountryList(r.excludedNationalities);
        _validateCountryList(r.includedIssuingCountries);
        _validateCountryList(r.excludedIssuingCountries);
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

        IExtendedVerifierHelper extendedHelper = IExtendedVerifierHelper(address(helper));
        _validateAge(r, extendedHelper, committedInputs);
        _validateBirthdate(r, extendedHelper, committedInputs);
        _validateExpiryDate(r, extendedHelper, committedInputs);
        _validateCountries(r, extendedHelper, committedInputs);

        // OS.ANY: a policy constrains the identity, not which phone OS attested
        // the face match
        if (
            r.faceMatchMode != FaceMatchMode.NONE
                && !extendedHelper.isFaceMatchVerified(r.faceMatchMode, OS.ANY, committedInputs)
        ) {
            revert PolicyEvaluator__FaceMatchRequirementNotMet();
        }

        if (r.sanctionsCheck) {
            helper.enforceSanctionsRoot(block.timestamp, true, committedInputs);
        }
    }

    function _validateAge(PolicyRequirements memory r, IExtendedVerifierHelper helper, bytes calldata committedInputs)
        internal
        view
    {
        if (r.minAge == 0 && r.maxAge == 0) return;
        bool ok;
        if (r.minAge > 0 && r.maxAge > 0) {
            ok = helper.isAgeBetween(r.minAge, r.maxAge, committedInputs);
        } else if (r.minAge > 0) {
            ok = helper.isAgeAboveOrEqual(r.minAge, committedInputs);
        } else {
            ok = helper.isAgeBelowOrEqual(r.maxAge, committedInputs);
        }
        if (!ok) revert PolicyEvaluator__AgeRequirementNotMet();
    }

    function _validateBirthdate(
        PolicyRequirements memory r,
        IExtendedVerifierHelper helper,
        bytes calldata committedInputs
    ) internal view {
        if (r.minBirthdate == 0 && r.maxBirthdate == 0) return;
        bool ok;
        if (r.minBirthdate > 0 && r.maxBirthdate > 0) {
            ok = helper.isBirthdateBetween(r.minBirthdate, r.maxBirthdate, committedInputs);
        } else if (r.minBirthdate > 0) {
            ok = helper.isBirthdateAfterOrEqual(r.minBirthdate, committedInputs);
        } else {
            ok = helper.isBirthdateBeforeOrEqual(r.maxBirthdate, committedInputs);
        }
        if (!ok) revert PolicyEvaluator__BirthdateRequirementNotMet();
    }

    function _validateExpiryDate(
        PolicyRequirements memory r,
        IExtendedVerifierHelper helper,
        bytes calldata committedInputs
    ) internal view {
        if (r.minExpiryDate == 0 && r.maxExpiryDate == 0) return;
        bool ok;
        if (r.minExpiryDate > 0 && r.maxExpiryDate > 0) {
            ok = helper.isExpiryDateBetween(r.minExpiryDate, r.maxExpiryDate, committedInputs);
        } else if (r.minExpiryDate > 0) {
            ok = helper.isExpiryDateAfterOrEqual(r.minExpiryDate, committedInputs);
        } else {
            ok = helper.isExpiryDateBeforeOrEqual(r.maxExpiryDate, committedInputs);
        }
        if (!ok) revert PolicyEvaluator__ExpiryDateRequirementNotMet();
    }

    function _validateCountries(
        PolicyRequirements memory r,
        IExtendedVerifierHelper helper,
        bytes calldata committedInputs
    ) internal view {
        if (r.includedNationalities.length > 0 && !helper.isNationalityIn(r.includedNationalities, committedInputs)) {
            revert PolicyEvaluator__NationalityNotIncluded();
        }
        if (r.excludedNationalities.length > 0 && !helper.isNationalityOut(r.excludedNationalities, committedInputs)) {
            revert PolicyEvaluator__ExcludedNationality();
        }
        if (
            r.includedIssuingCountries.length > 0
                && !helper.isIssuingCountryIn(r.includedIssuingCountries, committedInputs)
        ) {
            revert PolicyEvaluator__IssuingCountryNotIncluded();
        }
        if (
            r.excludedIssuingCountries.length > 0
                && !helper.isIssuingCountryOut(r.excludedIssuingCountries, committedInputs)
        ) {
            revert PolicyEvaluator__ExcludedIssuingCountry();
        }
    }

    /// @dev The verifier helper's country checks need the exact list committed
    ///      in the proof (sorted alphabetically for the exclusion variants),
    ///      and circuit country codes are ISO 3166-1 alpha-3. A lowercase or
    ///      padded entry round-trips consistently but never matches a real
    ///      country code, silently disabling the check — so reject it when the
    ///      policy is created. Strictly ascending order also rules out
    ///      duplicates.
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
}
