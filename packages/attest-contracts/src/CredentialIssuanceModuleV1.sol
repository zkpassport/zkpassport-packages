// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, NullifierType, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "@registry/IRootVerifier.sol";
import {ICredentialIssuanceModule, CredentialIssuanceVerdict} from "./ICredentialIssuanceModule.sol";
import {IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @title  CredentialIssuanceModuleV1
 * @notice First-generation issuance pipeline. Pins the root verifier this
 *         generation trusts; replacing the registry (or evolving the pipeline)
 *         means deploying a new module and pointing the credential ledger at it —
 *         the ledger's address and storage never move.
 */
contract CredentialIssuanceModuleV1 is ICredentialIssuanceModule {
    error CredentialIssuanceModule__MockProofNotAllowed();
    error CredentialIssuanceModule__InvalidProof();
    error CredentialIssuanceModule__WrongScope();
    error CredentialIssuanceModule__StaleProof();
    error CredentialIssuanceModule__ProofNotBoundToChain();

    IRootVerifier public immutable rootVerifier;

    uint256 public constant PROOF_FRESHNESS = 1 hours;

    constructor(IRootVerifier _rootVerifier) {
        rootVerifier = _rootVerifier;
    }

    function judge(
        string calldata domain,
        string calldata subscope,
        address evaluator,
        bytes calldata requirements,
        ProofVerificationParams calldata params
    ) external view returns (CredentialIssuanceVerdict memory verdict) {
        (bool valid, bytes32 nullifier, IVerifierHelper helper) = rootVerifier.verify(params);
        if (!valid) revert CredentialIssuanceModule__InvalidProof();

        _rejectMockProofs(params.proofVerificationData.publicInputs);

        if (!helper.verifyScopes(params.proofVerificationData.publicInputs, domain, subscope)) {
            revert CredentialIssuanceModule__WrongScope();
        }

        if (helper.getProofTimestamp(params.proofVerificationData.publicInputs) + PROOF_FRESHNESS < block.timestamp) {
            revert CredentialIssuanceModule__StaleProof();
        }

        BoundData memory bound = helper.getBoundData(params.committedInputs);
        if (bound.chainId != block.chainid) revert CredentialIssuanceModule__ProofNotBoundToChain();

        verdict.wallet = bound.senderAddress;
        verdict.customData = bound.customData;
        verdict.nullifier = nullifier;
        verdict.unique = IPolicyEvaluator(evaluator)
            .validate(requirements, helper, params.committedInputs, params.proofVerificationData.publicInputs);
    }

    /// @dev serviceConfig.devMode is required on testnets (it is how real documents
    ///      prove against the testnet registry roots) and inert on mainnets, where
    ///      mock certificates are not in the registries. The root verifier only uses
    ///      it to let mock-document proofs through, so reject those by nullifier type
    ///      instead of rejecting dev mode itself.
    function _rejectMockProofs(bytes32[] calldata publicInputs) internal pure {
        NullifierType nullifierType = NullifierType(uint256(publicInputs[publicInputs.length - 3]));
        if (
            nullifierType == NullifierType.NON_SALTED_MOCK_NULLIFIER
                || nullifierType == NullifierType.SALTED_MOCK_NULLIFIER
        ) {
            revert CredentialIssuanceModule__MockProofNotAllowed();
        }
    }
}
