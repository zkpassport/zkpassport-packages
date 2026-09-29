// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, FaceMatchMode, NullifierType, OS, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "@registry/IRootVerifier.sol";
import {PolicyEvaluationResult, IPolicyEvaluator} from "./IPolicyEvaluator.sol";

contract PolicyEvaluatorV1 is IPolicyEvaluator {
    enum SanctionsMode {
        NONE,
        NORMAL,
        STRICT
    }

    /// @dev minAge 0 disables the age check. Country lists are ISO 3166-1 alpha-3, strictly
    ///      ascending; an empty list disables that check.
    struct PolicyRequirements {
        uint8 minAge;
        SanctionsMode sanctionsMode;
        FaceMatchMode faceMatchMode;
        string[] includedNationalities;
        string[] excludedNationalities;
    }

    error PolicyEvaluator__DevModeProofRejected();
    error PolicyEvaluator__InvalidProof();
    error PolicyEvaluator__WrongScope();
    error PolicyEvaluator__StaleProof();
    error PolicyEvaluator__ProofNotBoundToChain();
    error PolicyEvaluator__InvalidCountryList();
    error PolicyEvaluator__UniquenessRequiresNullifierType();
    error PolicyEvaluator__WrongNullifierType();
    error PolicyEvaluator__AgeRequirementNotMet();
    error PolicyEvaluator__NationalityNotIncluded();
    error PolicyEvaluator__ExcludedNationality();
    error PolicyEvaluator__FaceMatchRequirementNotMet();
    error PolicyEvaluator__SaltedNullifierRequiresStrictFaceMatch();
    error PolicyEvaluator__ZeroAddress();

    IRootVerifier public immutable rootVerifier;

    /// @notice Whether dev-mode (mock document) proofs are accepted alongside real ones.
    ///         Deploy with true on testnets only: a non-dev evaluator rejects any submission
    ///         that requests dev-mode verification before it reaches the root verifier.
    bool public immutable devMode;

    /// @notice The nullifier type a proof must carry to issue under a policy that enforces
    ///         uniqueness; other policies leave the proof's nullifier type unconstrained.
    ///         NONE_NULLIFIER deploys an evaluator that only accepts policies without uniqueness.
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
        return 1;
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
    function validateRequirements(bytes calldata requirements, bool enforceUniqueness) external view {
        PolicyRequirements memory r = decodeRequirements(requirements);
        // A NONE-type proof carries a zero nullifier, which the ledger cannot dedup on.
        if (enforceUniqueness && uniqueIdentifierType == NullifierType.NONE_NULLIFIER) {
            revert PolicyEvaluator__UniquenessRequiresNullifierType();
        }

        // The app salts nullifiers (mock ones included) through a strict FaceMatch attestation,
        // so a salted-nullifier proof always commits STRICT mode. A uniqueness policy on a
        // salted evaluator that requires REGULAR could never issue.
        if (
            enforceUniqueness
                && (uniqueIdentifierType == NullifierType.SALTED_NULLIFIER
                    || uniqueIdentifierType == NullifierType.SALTED_MOCK_NULLIFIER)
                && r.faceMatchMode == FaceMatchMode.REGULAR
        ) {
            revert PolicyEvaluator__SaltedNullifierRequiresStrictFaceMatch();
        }

        _validateCountryList(r.includedNationalities);
        _validateCountryList(r.excludedNationalities);
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

        if (enforceUniqueness) {
            bytes32[] memory publicInputs = params.proofVerificationData.publicInputs;
            NullifierType proofType = NullifierType(uint256(publicInputs[publicInputs.length - 3]));
            if (proofType != uniqueIdentifierType) revert PolicyEvaluator__WrongNullifierType();
        }

        result.wallet = bound.senderAddress;
        result.customData = bound.customData;
        _validateRequirements(requirements, helper, params.committedInputs);
    }

    function _validateRequirements(bytes calldata requirements, IVerifierHelper helper, bytes memory committedInputs)
        internal
        view
    {
        PolicyRequirements memory r = decodeRequirements(requirements);

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
