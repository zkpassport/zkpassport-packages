// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "@registry/IRootVerifier.sol";
import {IIssuanceModule, IssuanceVerdict} from "./IIssuanceModule.sol";
import {IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @title  IssuanceModuleV1
 * @notice First-generation issuance pipeline. Pins the root verifier this
 *         generation trusts; replacing the registry (or evolving the pipeline)
 *         means deploying a new module and pointing the credential ledger at it —
 *         the ledger's address and storage never move.
 */
contract IssuanceModuleV1 is IIssuanceModule {
    error IssuanceModule__DevModeNotAllowed();
    error IssuanceModule__InvalidProof();
    error IssuanceModule__WrongScope();
    error IssuanceModule__StaleProof();
    error IssuanceModule__ProofNotBoundToChain();

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
    ) external view returns (IssuanceVerdict memory verdict) {
        if (params.serviceConfig.devMode) {
            revert IssuanceModule__DevModeNotAllowed();
        }

        (bool valid, bytes32 nullifier, IVerifierHelper helper) = rootVerifier.verify(params);
        if (!valid) revert IssuanceModule__InvalidProof();

        if (!helper.verifyScopes(params.proofVerificationData.publicInputs, domain, subscope)) {
            revert IssuanceModule__WrongScope();
        }

        if (helper.getProofTimestamp(params.proofVerificationData.publicInputs) + PROOF_FRESHNESS < block.timestamp) {
            revert IssuanceModule__StaleProof();
        }

        BoundData memory bound = helper.getBoundData(params.committedInputs);
        if (bound.chainId != block.chainid) revert IssuanceModule__ProofNotBoundToChain();

        verdict.wallet = bound.senderAddress;
        verdict.customData = bound.customData;
        verdict.nullifier = nullifier;
        verdict.unique = IPolicyEvaluator(evaluator)
            .validate(requirements, helper, params.committedInputs, params.proofVerificationData.publicInputs);
    }
}
