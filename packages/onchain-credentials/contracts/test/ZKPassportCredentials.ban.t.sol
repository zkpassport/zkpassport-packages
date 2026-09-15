// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";

contract ZKPassportCredentialsBanTest is ZKPassportCredentialsTestBase {
    uint256 internal bannablePolicyId;
    uint256 internal proofOnlyPolicyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        bannablePolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(41)),
            _requirements(NullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "https://policy.example/bannable",
            true,
            true,
            false
        );
        proofOnlyPolicyId = _createDefaultPolicy();
        zkPassportCredentials.issue(bannablePolicyId, _params());
    }

    function testBanRemovesStandingCredentialImmediately() public {
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.WalletBanned(wallet, bannablePolicyId);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
        assertTrue(zkPassportCredentials.banned(wallet, bannablePolicyId));
        assertEq(zkPassportCredentials.balanceOf(wallet, bannablePolicyId), 0);
        assertEq(zkPassportCredentials.heldUntil(wallet, bannablePolicyId), 0);
    }

    function testBanClearsAnExpiredCredentialRecord() public {
        vm.warp(uint256(zkPassportCredentials.heldUntil(wallet, bannablePolicyId)) + 1);
        vm.prank(creator);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
        assertEq(zkPassportCredentials.heldUntil(wallet, bannablePolicyId), 0);
    }

    function testBanWorksWithoutLiveCredential() public {
        // The would-be front-run: the holder renounces ahead of the owner's ban. The ban
        // does not depend on a live credential, so it lands regardless of the ordering.
        vm.prank(wallet);
        zkPassportCredentials.renounce(bannablePolicyId);
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.WalletBanned(wallet, bannablePolicyId);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
        assertTrue(zkPassportCredentials.banned(wallet, bannablePolicyId));
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WalletBanned.selector);
        zkPassportCredentials.issue(bannablePolicyId, _params());
    }

    function testBannedWalletCannotBeOwnerIssued() public {
        vm.prank(creator);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WalletBanned.selector);
        zkPassportCredentials.ownerIssue(wallet, bannablePolicyId);
    }

    function testBanRequiresOwnerBannablePolicy() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotBannable.selector);
        zkPassportCredentials.ban(wallet, proofOnlyPolicyId);
    }

    function testOthersCannotBan() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
    }

    function testBanWhenAlreadyBannedReverts() public {
        vm.prank(creator);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WalletBanned.selector);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
    }

    function testRenounceDoesNotBan() public {
        vm.prank(wallet);
        zkPassportCredentials.renounce(bannablePolicyId);
        assertFalse(zkPassportCredentials.banned(wallet, bannablePolicyId));
        zkPassportCredentials.issue(bannablePolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, bannablePolicyId), 1);
    }

    function testOwnerRenounceDoesNotBan() public {
        vm.prank(creator);
        zkPassportCredentials.ownerIssue(creator, bannablePolicyId);
        vm.prank(creator);
        zkPassportCredentials.renounce(bannablePolicyId);
        assertFalse(zkPassportCredentials.banned(creator, bannablePolicyId));
    }

    function testUnbanRestoresIssuance() public {
        vm.prank(creator);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.WalletUnbanned(wallet, bannablePolicyId);
        zkPassportCredentials.unban(wallet, bannablePolicyId);
        zkPassportCredentials.issue(bannablePolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, bannablePolicyId), 1);
    }

    function testOthersCannotUnban() public {
        vm.prank(creator);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.unban(wallet, bannablePolicyId);
    }

    function testUnbanWhenNotBannedReverts() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotBanned.selector);
        zkPassportCredentials.unban(wallet, bannablePolicyId);
    }

    function testHolderCanRenounceOnNonBannablePolicy() public {
        zkPassportCredentials.issue(proofOnlyPolicyId, _params());
        vm.prank(wallet);
        zkPassportCredentials.renounce(proofOnlyPolicyId);
        assertEq(zkPassportCredentials.heldUntil(wallet, proofOnlyPolicyId), 0);
        assertFalse(zkPassportCredentials.banned(wallet, proofOnlyPolicyId));
    }

    function testStoresOwnerBannableFlag() public {
        assertTrue(zkPassportCredentials.getPolicy(bannablePolicyId).ownerBannable);
        assertFalse(zkPassportCredentials.getPolicy(proofOnlyPolicyId).ownerBannable);
    }
}
