// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ProofVerificationParams} from "@registry/lib/Types.sol";
import {ICredentialIssuanceModule, CredentialIssuanceVerdict} from "../../src/ICredentialIssuanceModule.sol";

/// @dev A pipeline that ignores the proof and returns a preconfigured verdict — used to
///      test that a module swap redirects all issuance immediately and that the ledger
///      enforces its own invariants against any module's verdict.
contract MockIssuanceModuleV2 is ICredentialIssuanceModule {
    CredentialIssuanceVerdict internal _verdict;

    function setVerdict(address wallet, bytes32 nullifier, bool unique, string memory customData) external {
        _verdict =
            CredentialIssuanceVerdict({wallet: wallet, nullifier: nullifier, unique: unique, customData: customData});
    }

    function judge(string calldata, string calldata, address, bytes calldata, ProofVerificationParams calldata)
        external
        view
        returns (CredentialIssuanceVerdict memory)
    {
        return _verdict;
    }
}
