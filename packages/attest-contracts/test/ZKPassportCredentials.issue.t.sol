// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";

contract ZKPassportCredentialsIssueTest is ZKPassportCredentialsTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
    }

    function testIssueGrantsCredential() public {
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialIssued(wallet, policyId, uint64(block.timestamp + 30 days));
        zkPassportCredentials.issue(wallet, policyId, _params());
        assertEq(zkPassportCredentials.heldUntil(wallet, policyId), uint64(block.timestamp + 30 days));
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testIssueIsPermissionlessForTheCaller() public {
        vm.prank(makeAddr("sponsor"));
        zkPassportCredentials.issue(wallet, policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsForUnknownPolicy() public {
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyNotFound.selector, uint256(999))
        );
        zkPassportCredentials.issue(wallet, 999, _params());
    }

    function testIssueRevertsOnDevMode() public {
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__DevModeNotAllowed.selector);
        zkPassportCredentials.issue(wallet, policyId, _devModeParams());
    }

    function testIssueMintsToContractWalletWithoutReceiver() public {
        address contractWallet = address(mockHelper);
        mockHelper.setBoundData(contractWallet, block.chainid, "");
        zkPassportCredentials.issue(contractWallet, policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(contractWallet, policyId), 1);
    }

    function testIssueRevertsOnInvalidProof() public {
        mockVerifier.setValid(false);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__InvalidProof.selector);
        zkPassportCredentials.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnWrongScope() public {
        mockHelper.setScopesOk(false);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WrongScope.selector);
        zkPassportCredentials.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnStaleProof() public {
        mockHelper.setProofTimestamp(block.timestamp - 1 hours - 1);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__StaleProof.selector);
        zkPassportCredentials.issue(wallet, policyId, _params());
    }

    function testIssueAcceptsProofAtFreshnessBoundary() public {
        mockHelper.setProofTimestamp(block.timestamp - 1 hours);
        zkPassportCredentials.issue(wallet, policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsWhenBoundToOtherWallet() public {
        mockHelper.setBoundData(makeAddr("mallory"), block.chainid, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ProofNotBoundToWallet.selector);
        zkPassportCredentials.issue(wallet, policyId, _params());
    }

    function testIssueRevertsWhenBoundToOtherChain() public {
        mockHelper.setBoundData(wallet, block.chainid + 1, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ProofNotBoundToChain.selector);
        zkPassportCredentials.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnUnexpectedCustomData() public {
        mockHelper.setBoundData(wallet, block.chainid, "extra");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__UnexpectedBoundData.selector);
        zkPassportCredentials.issue(wallet, policyId, _params());
    }

    function testIssuePassesContractOwnedScopesToVerifier() public {
        mockHelper.setExpectedScopes(DOMAIN, zkPassportCredentials.policyScope(policyId));
        zkPassportCredentials.issue(wallet, policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsWhenScopesDoNotMatch() public {
        mockHelper.setExpectedScopes("evil.example", zkPassportCredentials.policyScope(policyId));
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WrongScope.selector);
        zkPassportCredentials.issue(wallet, policyId, _params());
    }
}
