// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, FaceMatchMode, NullifierType, OS, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "@registry/IRootVerifier.sol";
import {VerificationMethods, VerificationMethod} from "@registry/lib/VerificationMethods.sol";
import {PolicyEvaluationResult, IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @notice PolicyEvaluatorV1 plus the verification methods a policy accepts. V1 accepts any ID the
 *         root verifier does, which since circuit version 0.23.0 includes device-attested camera
 *         reads (tier 2); a V2 policy accepts tier 1 only unless it lists more.
 */
contract PolicyEvaluatorV2 is IPolicyEvaluator {
    enum SanctionsMode {
        NONE,
        NORMAL,
        STRICT
    }

    /// @dev minAge 0 disables the age check. Country lists are ISO 3166-1 alpha-3, strictly
    ///      ascending; an empty list disables that check. allowedVerificationMethods lists exact
    ///      schemes (e.g. 201) and/or whole tiers (an entry below 100, e.g. 1 for every
    ///      issuer-signed scheme), so [1, 201] accepts tier 1 and Android camera reads; empty
    ///      means tier 1 only.
    struct PolicyRequirements {
        uint8 minAge;
        SanctionsMode sanctionsMode;
        FaceMatchMode faceMatchMode;
        string[] includedNationalities;
        string[] excludedNationalities;
        uint256[] allowedVerificationMethods;
    }

    error PolicyEvaluator__DevModeProofRejected();
    error PolicyEvaluator__InvalidProof();
    error PolicyEvaluator__WrongScope();
    error PolicyEvaluator__StaleProof();
    error PolicyEvaluator__ProofNotBoundToChain();
    error PolicyEvaluator__InvalidCountryList();
    error PolicyEvaluator__WrongNullifierType();
    error PolicyEvaluator__AgeRequirementNotMet();
    error PolicyEvaluator__NationalityNotIncluded();
    error PolicyEvaluator__ExcludedNationality();
    error PolicyEvaluator__FaceMatchRequirementNotMet();
    error PolicyEvaluator__ZeroAddress();
    error PolicyEvaluator__InvalidVerificationMethods();
    error PolicyEvaluator__VerificationMethodNotAllowed();
    error PolicyEvaluator__NonCanonicalRequirements();

    IRootVerifier public immutable rootVerifier;

    /// @notice Whether dev-mode (mock document) proofs are accepted alongside real ones.
    ///         Deploy with true on testnets only: a non-dev evaluator rejects any submission
    ///         that requests dev-mode verification before it reaches the root verifier.
    bool public immutable devMode;

    /// @notice The nullifier type a proof must carry to issue under a policy that enforces
    ///         uniqueness; other policies leave the proof's nullifier type unconstrained.
    ///         Under NONE_NULLIFIER no uniqueness policy can issue: a NONE proof has no nullifier.
    NullifierType public immutable uniqueIdentifierType;

    uint256 public constant PROOF_FRESHNESS = 1 days;

    constructor(IRootVerifier _rootVerifier, bool _devMode, NullifierType _uniqueIdentifierType) {
        if (address(_rootVerifier) == address(0)) revert PolicyEvaluator__ZeroAddress();
        rootVerifier = _rootVerifier;
        devMode = _devMode;
        uniqueIdentifierType = _uniqueIdentifierType;
    }

    /// @inheritdoc IPolicyEvaluator
    function schemaVersion() external pure returns (uint256) {
        return 2;
    }

    /// @notice Typed decode for off-chain consumers (request building); the
    ///         return type is version-specific, so this is not part of
    ///         IPolicyEvaluator.
    /// @param requirements The abi-encoded PolicyRequirements bytes.
    /// @return The decoded requirements struct.
    function decodeRequirements(bytes calldata requirements) public pure returns (PolicyRequirements memory) {
        return abi.decode(requirements, (PolicyRequirements));
    }

    /// @notice Typed decode of the proof-data bytes this evaluator's `evaluate` expects;
    ///         version-specific, so not part of IPolicyEvaluator.
    /// @param proofData The abi-encoded ProofVerificationParams bytes.
    /// @return The decoded proof verification params.
    function decodeProofData(bytes calldata proofData) public pure returns (ProofVerificationParams memory) {
        return abi.decode(proofData, (ProofVerificationParams));
    }

    /// @inheritdoc IPolicyEvaluator
    function validateRequirements(bytes calldata requirements) external pure {
        PolicyRequirements memory r = decodeRequirements(requirements);
        // Only the exact encoding of what decodes: a blob encoded for V1 can decode here with its
        // fields shifted (a minAge 1, STRICT policy reads as allowedVerificationMethods [2])
        if (keccak256(abi.encode(r)) != keccak256(requirements)) revert PolicyEvaluator__NonCanonicalRequirements();
        _validateCountryList(r.includedNationalities);
        _validateCountryList(r.excludedNationalities);
        _validateVerificationMethods(r.allowedVerificationMethods);
    }

    /// @inheritdoc IPolicyEvaluator
    function evaluate(
        string calldata domain,
        string calldata subscope,
        bytes calldata requirements,
        bool enforceUniqueness,
        bytes calldata proofData
    ) external view returns (PolicyEvaluationResult memory result) {
        ProofVerificationParams memory params = decodeProofData(proofData);

        if (!devMode && params.serviceConfig.devMode) revert PolicyEvaluator__DevModeProofRejected();

        bool valid;
        IVerifierHelper helper;
        (valid, result.nullifier, helper) = rootVerifier.verify(params);
        if (!valid) revert PolicyEvaluator__InvalidProof();

        if (!helper.verifyScopes(params.proofVerificationData.publicInputs, domain, subscope)) {
            revert PolicyEvaluator__WrongScope();
        }

        if (helper.getProofTimestamp(params.proofVerificationData.publicInputs) + PROOF_FRESHNESS < block.timestamp) {
            revert PolicyEvaluator__StaleProof();
        }

        BoundData memory bound = helper.getBoundData(params.committedInputs);
        if (bound.chainId != block.chainid) revert PolicyEvaluator__ProofNotBoundToChain();

        if (
            enforceUniqueness
                && helper.getNullifierType(params.proofVerificationData.publicInputs) != uniqueIdentifierType
        ) {
            revert PolicyEvaluator__WrongNullifierType();
        }

        result.wallet = bound.senderAddress;
        result.customData = bound.customData;
        _validateRequirements(requirements, helper, params.proofVerificationData.publicInputs, params.committedInputs);
    }

    function _validateRequirements(
        bytes calldata requirements,
        IVerifierHelper helper,
        bytes32[] memory publicInputs,
        bytes memory committedInputs
    ) internal view {
        PolicyRequirements memory r = decodeRequirements(requirements);

        if (!VerificationMethods.isAllowed(_verificationMethod(helper, publicInputs), r.allowedVerificationMethods)) {
            revert PolicyEvaluator__VerificationMethodNotAllowed();
        }

        if (r.minAge > 0 && !helper.isAgeAboveOrEqual(r.minAge, committedInputs)) {
            revert PolicyEvaluator__AgeRequirementNotMet();
        }

        if (r.includedNationalities.length > 0 && !helper.isNationalityIn(r.includedNationalities, committedInputs)) {
            revert PolicyEvaluator__NationalityNotIncluded();
        }
        if (r.excludedNationalities.length > 0 && !helper.isNationalityOut(r.excludedNationalities, committedInputs)) {
            revert PolicyEvaluator__ExcludedNationality();
        }

        // OS.ANY: a policy constrains the identity, not which phone OS attested the face match
        if (
            r.faceMatchMode != FaceMatchMode.NONE
                && !helper.isFaceMatchVerified(r.faceMatchMode, OS.ANY, committedInputs)
        ) {
            revert PolicyEvaluator__FaceMatchRequirementNotMet();
        }

        if (r.sanctionsMode != SanctionsMode.NONE) {
            helper.enforceSanctionsRoot(block.timestamp, r.sanctionsMode == SanctionsMode.STRICT, committedInputs);
        }
    }

    /// @dev The method the proof's ID was verified with. Helpers for circuit versions before
    ///      0.23.0 have no getVerificationMethod, and every proof of those versions is an ICAO chip
    ///      read, so a helper without it means ICAO_CHIP. Calling a function a contract doesn't have
    ///      reverts with no data; any other revert is passed on, so a newer helper that fails for
    ///      another reason can't make a Tier 2 proof pass as a chip read.
    function _verificationMethod(IVerifierHelper helper, bytes32[] memory publicInputs)
        internal
        view
        returns (uint256)
    {
        try helper.getVerificationMethod(publicInputs) returns (uint256 scheme) {
            return scheme;
        } catch (bytes memory reason) {
            if (reason.length != 0) {
                assembly {
                    revert(add(reason, 32), mload(reason))
                }
            }
            return VerificationMethod.ICAO_CHIP;
        }
    }

    /// @dev Each entry a whole tier the root verifier can verify (1 or 2) or one of its known
    ///      schemes, so a typo can't silently accept nothing or something unintended
    function _validateVerificationMethods(uint256[] memory schemes) internal pure {
        for (uint256 i = 0; i < schemes.length; i++) {
            uint256 entry = schemes[i];
            bool known = VerificationMethods.isTier(entry) || entry == VerificationMethod.ICAO_CHIP
                || entry == VerificationMethod.UIDAI_AADHAAR || entry == VerificationMethod.JPKI
                || entry == VerificationMethod.ISO_MDOC || entry == VerificationMethod.ATTESTED_CAPTURE_IOS
                || entry == VerificationMethod.ATTESTED_CAPTURE_ANDROID;
            if (!known) revert PolicyEvaluator__InvalidVerificationMethods();
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
