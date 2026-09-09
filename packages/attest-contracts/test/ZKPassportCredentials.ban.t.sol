// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";

contract ZKPassportCredentialsBanTest is ZKPassportCredentialsTestBase {
    uint256 internal revocablePolicyId;
    uint256 internal proofOnlyPolicyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        revocablePolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(41)),
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER,
                0,
                PolicyEvaluatorV1.SanctionsMode.NONE,
                noCountries
            ),
            30 days,
            "https://policy.example/revocable",
            true,
            true
        );
        proofOnlyPolicyId = _createDefaultPolicy();
        zkPassportCredentials.issue(revocablePolicyId, _params());
    }

    function testOwnerCanRevoke() public {
        vm.prank(creator);
        zkPassportCredentials.revoke(wallet, revocablePolicyId);
        assertEq(zkPassportCredentials.balanceOf(wallet, revocablePolicyId), 0);
        assertEq(zkPassportCredentials.heldUntil(wallet, revocablePolicyId), 0);
    }

    function testOwnerCanRevokeExpiredCredential() public {
        vm.warp(uint256(zkPassportCredentials.heldUntil(wallet, revocablePolicyId)) + 1);
        vm.prank(creator);
        zkPassportCredentials.revoke(wallet, revocablePolicyId);
        assertEq(zkPassportCredentials.heldUntil(wallet, revocablePolicyId), 0);
    }

    function testOwnerRevokeBansWallet() public {
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.WalletBanned(wallet, revocablePolicyId);
        zkPassportCredentials.revoke(wallet, revocablePolicyId);
        assertTrue(zkPassportCredentials.banned(wallet, revocablePolicyId));
    }

    function testBannedWalletCannotReissue() public {
        vm.prank(creator);
        zkPassportCredentials.revoke(wallet, revocablePolicyId);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WalletBanned.selector);
        zkPassportCredentials.issue(revocablePolicyId, _params());
    }

    function testBannedWalletCannotBeOwnerIssued() public {
        vm.prank(creator);
        zkPassportCredentials.revoke(wallet, revocablePolicyId);
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WalletBanned.selector);
        zkPassportCredentials.ownerIssue(wallet, revocablePolicyId);
    }

    function testSelfRevokeDoesNotBan() public {
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, revocablePolicyId);
        assertFalse(zkPassportCredentials.banned(wallet, revocablePolicyId));
        zkPassportCredentials.issue(revocablePolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, revocablePolicyId), 1);
    }

    function testOwnerSelfRevokeDoesNotBan() public {
        vm.prank(creator);
        zkPassportCredentials.ownerIssue(creator, revocablePolicyId);
        vm.prank(creator);
        zkPassportCredentials.revoke(creator, revocablePolicyId);
        assertFalse(zkPassportCredentials.banned(creator, revocablePolicyId));
    }

    function testUnbanRestoresIssuance() public {
        vm.prank(creator);
        zkPassportCredentials.revoke(wallet, revocablePolicyId);
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.WalletUnbanned(wallet, revocablePolicyId);
        zkPassportCredentials.unban(wallet, revocablePolicyId);
        zkPassportCredentials.issue(revocablePolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, revocablePolicyId), 1);
    }

    function testOthersCannotUnban() public {
        vm.prank(creator);
        zkPassportCredentials.revoke(wallet, revocablePolicyId);
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.unban(wallet, revocablePolicyId);
    }

    function testUnbanWhenNotBannedReverts() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotBanned.selector);
        zkPassportCredentials.unban(wallet, revocablePolicyId);
    }

    function testOwnerCannotRevokeOnNonRevocablePolicy() public {
        zkPassportCredentials.issue(proofOnlyPolicyId, _params());
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotRevocable.selector);
        zkPassportCredentials.revoke(wallet, proofOnlyPolicyId);
    }

    function testHolderCanSelfRevokeOnNonRevocablePolicy() public {
        zkPassportCredentials.issue(proofOnlyPolicyId, _params());
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, proofOnlyPolicyId);
        assertEq(zkPassportCredentials.heldUntil(wallet, proofOnlyPolicyId), 0);
        assertFalse(zkPassportCredentials.banned(wallet, proofOnlyPolicyId));
    }

    function testStoresOwnerRevocableFlag() public {
        assertTrue(zkPassportCredentials.getPolicy(revocablePolicyId).ownerRevocable);
        assertFalse(zkPassportCredentials.getPolicy(proofOnlyPolicyId).ownerRevocable);
    }
}
