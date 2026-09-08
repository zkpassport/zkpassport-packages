// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {FaceMatchMode, NullifierType, OS} from "@registry/lib/Types.sol";
import {IVerifierHelper} from "@registry/IRootVerifier.sol";
import {IExtendedVerifierHelper} from "./IExtendedVerifierHelper.sol";
import {IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @title  PolicyEvaluatorV1
 * @notice First-generation requirements schema: one-per-document uniqueness by
 *         nullifier type, minimum age, nationality allow/deny lists, FaceMatch,
 *         and sanctions checking. Stateless — policies store their requirements
 *         as abi-encoded bytes and share this single deployment.
 */
contract PolicyEvaluatorV1 is IPolicyEvaluator {
    enum SanctionsMode {
        NONE,
        NORMAL,
        STRICT
    }

    /// @dev minAge 0 disables the age check. uniqueIdentifierType NONE leaves
    ///      the proof's nullifier type unconstrained; any other value requires
    ///      the proof to carry exactly that type. enforceUniqueness turns on
    ///      one-per-document dedup (the ledger consumes the nullifier) and
    ///      needs a constrained nullifier type to dedup on. Country lists are
    ///      ISO 3166-1 alpha-3, strictly ascending; an empty list disables
    ///      that check.
    struct PolicyRequirements {
        NullifierType uniqueIdentifierType;
        bool enforceUniqueness;
        uint8 minAge;
        SanctionsMode sanctionsMode;
        FaceMatchMode faceMatchMode;
        string[] includedNationalities;
        string[] excludedNationalities;
    }

    error PolicyEvaluator__InvalidNullifierType();
    error PolicyEvaluator__InvalidCountryList();
    error PolicyEvaluator__UniquenessRequiresNullifierType();
    error PolicyEvaluator__WrongNullifierType();
    error PolicyEvaluator__AgeRequirementNotMet();
    error PolicyEvaluator__NationalityNotIncluded();
    error PolicyEvaluator__ExcludedNationality();
    error PolicyEvaluator__FaceMatchRequirementNotMet();
    error PolicyEvaluator__SaltedNullifierRequiresStrictFaceMatch();

    /// @inheritdoc IPolicyEvaluator
    function schemaVersion() external pure returns (uint256) {
        return 1;
    }

    /// @notice Typed decode for off-chain consumers (request building); the
    ///         return type is version-specific, so this is not part of
    ///         IPolicyEvaluator
    /// @param requirements The abi-encoded PolicyRequirements bytes
    /// @return The decoded requirements struct
    function decodeRequirements(bytes calldata requirements) public pure returns (PolicyRequirements memory) {
        return abi.decode(requirements, (PolicyRequirements));
    }

    /// @inheritdoc IPolicyEvaluator
    function validateRequirements(bytes calldata requirements) external pure {
        PolicyRequirements memory r = decodeRequirements(requirements);
        if (
            r.uniqueIdentifierType != NullifierType.NONE_NULLIFIER
                && r.uniqueIdentifierType != NullifierType.NON_SALTED_NULLIFIER
                && r.uniqueIdentifierType != NullifierType.SALTED_NULLIFIER
        ) revert PolicyEvaluator__InvalidNullifierType();
        if (r.enforceUniqueness && r.uniqueIdentifierType == NullifierType.NONE_NULLIFIER) {
            revert PolicyEvaluator__UniquenessRequiresNullifierType();
        }
        // The app salts nullifiers through a strict FaceMatch attestation, so a
        // salted-nullifier proof always commits STRICT mode — a policy pairing
        // SALTED with REGULAR could never issue.
        if (r.uniqueIdentifierType == NullifierType.SALTED_NULLIFIER && r.faceMatchMode == FaceMatchMode.REGULAR) {
            revert PolicyEvaluator__SaltedNullifierRequiresStrictFaceMatch();
        }
        _validateCountryList(r.includedNationalities);
        _validateCountryList(r.excludedNationalities);
    }

    /// @inheritdoc IPolicyEvaluator
    function validate(
        bytes calldata requirements,
        IVerifierHelper helper,
        bytes calldata committedInputs,
        bytes32[] calldata publicInputs
    ) external view returns (bool unique) {
        PolicyRequirements memory r = decodeRequirements(requirements);

        if (r.uniqueIdentifierType != NullifierType.NONE_NULLIFIER) {
            NullifierType nullifierType = NullifierType(uint256(publicInputs[publicInputs.length - 3]));
            if (nullifierType != r.uniqueIdentifierType) revert PolicyEvaluator__WrongNullifierType();
        }
        unique = r.enforceUniqueness;

        if (r.minAge > 0 && !helper.isAgeAboveOrEqual(r.minAge, committedInputs)) {
            revert PolicyEvaluator__AgeRequirementNotMet();
        }

        IExtendedVerifierHelper extendedHelper = IExtendedVerifierHelper(address(helper));
        if (
            r.includedNationalities.length > 0
                && !extendedHelper.isNationalityIn(r.includedNationalities, committedInputs)
        ) {
            revert PolicyEvaluator__NationalityNotIncluded();
        }
        if (r.excludedNationalities.length > 0 && !helper.isNationalityOut(r.excludedNationalities, committedInputs)) {
            revert PolicyEvaluator__ExcludedNationality();
        }

        // OS.ANY: a policy constrains the identity, not which phone OS attested
        // the face match
        if (
            r.faceMatchMode != FaceMatchMode.NONE
                && !extendedHelper.isFaceMatchVerified(r.faceMatchMode, OS.ANY, committedInputs)
        ) {
            revert PolicyEvaluator__FaceMatchRequirementNotMet();
        }

        if (r.sanctionsMode != SanctionsMode.NONE) {
            helper.enforceSanctionsRoot(block.timestamp, r.sanctionsMode == SanctionsMode.STRICT, committedInputs);
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
