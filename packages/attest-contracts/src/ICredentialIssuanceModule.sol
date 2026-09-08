// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ProofVerificationParams} from "@registry/lib/Types.sol";

struct CredentialIssuanceVerdict {
    address wallet;
    bytes32 nullifier;
    bool unique;
    string customData;
}

/**
 * @title  ICredentialIssuanceModule
 * @notice Stable surface of the issuance pipeline: a stateless, view-only
 *         contract that verifies a proof through the root verifier, applies the
 *         universal checks (scope, freshness, chain binding), consults the
 *         policy's evaluator, and returns a verdict. The credential ledger
 *         commits verdicts under its own hard-coded invariants — a module
 *         decides whether a credential may issue, never how state mutates.
 */
interface ICredentialIssuanceModule {
    function judge(
        string calldata domain,
        string calldata subscope,
        address evaluator,
        bytes calldata requirements,
        ProofVerificationParams calldata params
    ) external view returns (CredentialIssuanceVerdict memory verdict);
}
