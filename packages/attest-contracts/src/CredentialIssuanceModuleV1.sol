// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "@registry/IRootVerifier.sol";
import {ICredentialIssuanceModule, CredentialIssuanceVerdict} from "./ICredentialIssuanceModule.sol";
import {IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @title  CredentialIssuanceModuleV1
 * @notice Issuance logic module for ZKPassportCredentials.
 */
contract CredentialIssuanceModuleV1 is ICredentialIssuanceModule {
    error CredentialIssuanceModule__InvalidProof();
    error CredentialIssuanceModule__WrongScope();
    error CredentialIssuanceModule__StaleProof();
    error CredentialIssuanceModule__ProofNotBoundToChain();

    IRootVerifier public immutable rootVerifier;

    uint256 public constant PROOF_FRESHNESS = 1 hours;

    constructor(IRootVerifier _rootVerifier) {
        rootVerifier = _rootVerifier;
    }

    /// @inheritdoc ICredentialIssuanceModule
    /// @dev Mock-document proofs (dev mode) are deliberately not rejected here: the root
    ///      verifier admits them only with serviceConfig.devMode set, and only testnet
    ///      registries contain the mock certificates, so on mainnets they fail at the
    ///      certificate root regardless of devMode.
    function judge(
        string calldata domain,
        string calldata subscope,
        address evaluator,
        bytes calldata requirements,
        ProofVerificationParams calldata proofVerificationParams
    ) external view returns (CredentialIssuanceVerdict memory verdict) {
        (bool valid, bytes32 nullifier, IVerifierHelper helper) = rootVerifier.verify(proofVerificationParams);
        if (!valid) revert CredentialIssuanceModule__InvalidProof();

        if (!helper.verifyScopes(proofVerificationParams.proofVerificationData.publicInputs, domain, subscope)) {
            revert CredentialIssuanceModule__WrongScope();
        }

        if (
            helper.getProofTimestamp(proofVerificationParams.proofVerificationData.publicInputs) + PROOF_FRESHNESS
                < block.timestamp
        ) {
            revert CredentialIssuanceModule__StaleProof();
        }

        BoundData memory bound = helper.getBoundData(proofVerificationParams.committedInputs);
        if (bound.chainId != block.chainid) revert CredentialIssuanceModule__ProofNotBoundToChain();

        verdict.wallet = bound.senderAddress;
        verdict.customData = bound.customData;
        verdict.nullifier = nullifier;
        verdict.unique = IPolicyEvaluator(evaluator)
            .validate(
                requirements,
                helper,
                proofVerificationParams.committedInputs,
                proofVerificationParams.proofVerificationData.publicInputs
            );
    }
}
