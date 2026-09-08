// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {IssuanceModuleV1} from "../src/IssuanceModuleV1.sol";

contract ZKPassportCredentialsIssueTest is ZKPassportCredentialsTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
    }

    function testIssueGrantsCredential() public {
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialIssued(wallet, policyId, uint64(block.timestamp + 30 days), "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.heldUntil(wallet, policyId), uint64(block.timestamp + 30 days));
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testIssueIsPermissionlessForTheCaller() public {
        vm.prank(makeAddr("sponsor"));
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsForUnknownPolicy() public {
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyNotFound.selector, uint256(999))
        );
        zkPassportCredentials.issue(999, _params());
    }

    function testIssueRevertsOnDevMode() public {
        vm.expectRevert(IssuanceModuleV1.IssuanceModule__DevModeNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _devModeParams());
    }

    function testIssueMintsToContractWalletWithoutReceiver() public {
        address contractWallet = address(mockHelper);
        mockHelper.setBoundData(contractWallet, block.chainid, "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(contractWallet, policyId), 1);
    }

    function testIssueRevertsOnInvalidProof() public {
        mockVerifier.setValid(false);
        vm.expectRevert(IssuanceModuleV1.IssuanceModule__InvalidProof.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testIssueRevertsOnWrongScope() public {
        mockHelper.setScopesOk(false);
        vm.expectRevert(IssuanceModuleV1.IssuanceModule__WrongScope.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testIssueRevertsOnStaleProof() public {
        mockHelper.setProofTimestamp(block.timestamp - 1 hours - 1);
        vm.expectRevert(IssuanceModuleV1.IssuanceModule__StaleProof.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testIssueAcceptsProofAtFreshnessBoundary() public {
        mockHelper.setProofTimestamp(block.timestamp - 1 hours);
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testIssueCreditsTheWalletTheProofIsBoundTo() public {
        address bound = makeAddr("bound");
        mockHelper.setBoundData(bound, block.chainid, "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(bound, policyId), 1);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 0);
    }

    function testIssueRevertsWhenProofBindsNoWallet() public {
        mockHelper.setBoundData(address(0), block.chainid, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testIssueRevertsWhenBoundToOtherChain() public {
        mockHelper.setBoundData(wallet, block.chainid + 1, "");
        vm.expectRevert(IssuanceModuleV1.IssuanceModule__ProofNotBoundToChain.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testIssueEmitsBoundCustomData() public {
        mockHelper.setBoundData(wallet, block.chainid, "customer:123");
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialIssued(wallet, policyId, uint64(block.timestamp + 30 days), "customer:123");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testRenewalEmitsBoundCustomData() public {
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setBoundData(wallet, block.chainid, "customer:123");
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialRenewed(
            wallet, policyId, uint64(block.timestamp + 30 days), "customer:123"
        );
        zkPassportCredentials.issue(policyId, _params());
    }

    function testIssuePassesContractOwnedScopesToVerifier() public {
        mockHelper.setExpectedScopes(DOMAIN, zkPassportCredentials.policyScope(policyId));
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsWhenScopesDoNotMatch() public {
        mockHelper.setExpectedScopes("evil.example", zkPassportCredentials.policyScope(policyId));
        vm.expectRevert(IssuanceModuleV1.IssuanceModule__WrongScope.selector);
        zkPassportCredentials.issue(policyId, _params());
    }
}
