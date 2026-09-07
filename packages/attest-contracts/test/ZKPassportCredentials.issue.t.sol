// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";

contract ZKPassportCredentialsIssueTest is AttestTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
    }

    function testIssueGrantsCredential() public {
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialIssued(wallet, policyId, uint64(block.timestamp + 30 days));
        attest.issue(wallet, policyId, _params());
        assertEq(attest.heldUntil(wallet, policyId), uint64(block.timestamp + 30 days));
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testIssueIsPermissionlessForTheCaller() public {
        vm.prank(makeAddr("sponsor"));
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsForUnknownPolicy() public {
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyNotFound.selector, uint256(999))
        );
        attest.issue(wallet, 999, _params());
    }

    function testIssueAcceptsDevModeParams() public {
        attest.issue(wallet, policyId, _devModeParams());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsOnInvalidProof() public {
        mockVerifier.setValid(false);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__InvalidProof.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnWrongScope() public {
        mockHelper.setScopesOk(false);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WrongScope.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnStaleProof() public {
        mockHelper.setProofTimestamp(block.timestamp - 1 hours - 1);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__StaleProof.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueAcceptsProofAtFreshnessBoundary() public {
        mockHelper.setProofTimestamp(block.timestamp - 1 hours);
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsWhenBoundToOtherWallet() public {
        mockHelper.setBoundData(makeAddr("mallory"), block.chainid, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ProofNotBoundToWallet.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueRevertsWhenBoundToOtherChain() public {
        mockHelper.setBoundData(wallet, block.chainid + 1, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ProofNotBoundToChain.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnUnexpectedCustomData() public {
        mockHelper.setBoundData(wallet, block.chainid, "extra");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__UnexpectedBoundData.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssuePassesContractOwnedScopesToVerifier() public {
        mockHelper.setExpectedScopes(DOMAIN, attest.policyScope(policyId));
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsWhenScopesDoNotMatch() public {
        mockHelper.setExpectedScopes("evil.example", attest.policyScope(policyId));
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WrongScope.selector);
        attest.issue(wallet, policyId, _params());
    }
}
