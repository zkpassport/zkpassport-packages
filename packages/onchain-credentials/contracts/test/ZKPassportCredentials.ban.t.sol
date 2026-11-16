// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {Vm} from "forge-std/Vm.sol";

contract ZKPassportCredentialsBanTest is ZKPassportCredentialsTestBase {
    uint256 internal bannablePolicyId;
    uint256 internal proofOnlyPolicyId;
    address internal issuer = makeAddr("issuer");
    address internal otherWallet = makeAddr("otherWallet");

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        bannablePolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(41)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "https://policy.example/bannable",
            false,
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

    function testBanOnUniquePolicyKeepsTheDocumentBound() public {
        vm.prank(creator);
        uint256 uniquePolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(42)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "https://policy.example/bannable-unique",
            true,
            false,
            true,
            false
        );
        zkPassportCredentials.issue(uniquePolicyId, _params());
        vm.prank(creator);
        zkPassportCredentials.ban(wallet, uniquePolicyId);

        // The binding outlives the ban, so the banned document cannot return through another wallet.
        mockHelper.setBoundData(makeAddr("other"), block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(uniquePolicyId, _params());

        vm.prank(creator);
        zkPassportCredentials.unban(wallet, uniquePolicyId);
        mockHelper.setBoundData(wallet, block.chainid, "");
        zkPassportCredentials.issue(uniquePolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, uniquePolicyId), 1);
    }

    function testBanRequiresOwnerBannablePolicy() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotBannable.selector);
        zkPassportCredentials.ban(wallet, proofOnlyPolicyId);
    }

    function testOthersCannotBan() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
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
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
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

    function testIssuerCanBanAndUnban() public {
        _addIssuer(issuer);

        vm.prank(issuer);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
        assertTrue(zkPassportCredentials.banned(wallet, bannablePolicyId));
        assertEq(zkPassportCredentials.balanceOf(wallet, bannablePolicyId), 0);

        vm.prank(issuer);
        zkPassportCredentials.unban(wallet, bannablePolicyId);
        assertFalse(zkPassportCredentials.banned(wallet, bannablePolicyId));
    }

    function testRemovedIssuerCannotBan() public {
        _addIssuer(issuer);
        vm.prank(creator);
        zkPassportCredentials.removeIssuer(issuer, bannablePolicyId);

        vm.prank(issuer);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
        zkPassportCredentials.ban(wallet, bannablePolicyId);
    }

    function testBanBatchBansEveryWalletAndRemovesTheirCredentials() public {
        vm.prank(creator);
        zkPassportCredentials.ownerIssue(otherWallet, bannablePolicyId);

        vm.prank(creator);
        zkPassportCredentials.banBatch(_bothWallets(), bannablePolicyId);

        assertTrue(zkPassportCredentials.banned(wallet, bannablePolicyId));
        assertTrue(zkPassportCredentials.banned(otherWallet, bannablePolicyId));
        assertEq(zkPassportCredentials.balanceOf(wallet, bannablePolicyId), 0);
        assertEq(zkPassportCredentials.balanceOf(otherWallet, bannablePolicyId), 0);
    }

    function testBanBatchSkipsBannedWallets() public {
        vm.prank(creator);
        zkPassportCredentials.ban(wallet, bannablePolicyId);

        vm.recordLogs();
        vm.prank(creator);
        zkPassportCredentials.banBatch(_bothWallets(), bannablePolicyId);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ZKPassportCredentials.WalletBanned.selector);
        assertEq(logs[0].topics[1], bytes32(uint256(uint160(otherWallet))));
        assertTrue(zkPassportCredentials.banned(otherWallet, bannablePolicyId));
    }

    function testBanBatchRequiresOwnerBannablePolicy() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotBannable.selector);
        zkPassportCredentials.banBatch(_bothWallets(), proofOnlyPolicyId);
    }

    function testUnbanBatchSkipsWalletsNotBanned() public {
        vm.prank(creator);
        zkPassportCredentials.ban(wallet, bannablePolicyId);

        vm.recordLogs();
        vm.prank(creator);
        zkPassportCredentials.unbanBatch(_bothWallets(), bannablePolicyId);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ZKPassportCredentials.WalletUnbanned.selector);
        assertEq(logs[0].topics[1], bytes32(uint256(uint160(wallet))));
        assertFalse(zkPassportCredentials.banned(wallet, bannablePolicyId));
    }

    function testIssuerCanBanAndUnbanInBatches() public {
        _addIssuer(issuer);

        vm.prank(issuer);
        zkPassportCredentials.banBatch(_bothWallets(), bannablePolicyId);
        assertTrue(zkPassportCredentials.banned(wallet, bannablePolicyId));
        assertTrue(zkPassportCredentials.banned(otherWallet, bannablePolicyId));

        vm.prank(issuer);
        zkPassportCredentials.unbanBatch(_bothWallets(), bannablePolicyId);
        assertFalse(zkPassportCredentials.banned(wallet, bannablePolicyId));
        assertFalse(zkPassportCredentials.banned(otherWallet, bannablePolicyId));
    }

    function testOthersCannotBanOrUnbanInBatches() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
        zkPassportCredentials.banBatch(_bothWallets(), bannablePolicyId);

        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
        zkPassportCredentials.unbanBatch(_bothWallets(), bannablePolicyId);
    }

    function testBanAndUnbanBatchesWorkWhilePaused() public {
        vm.prank(admin);
        zkPassportCredentials.pause();

        vm.prank(creator);
        zkPassportCredentials.banBatch(_bothWallets(), bannablePolicyId);
        assertTrue(zkPassportCredentials.banned(wallet, bannablePolicyId));
        assertEq(zkPassportCredentials.balanceOf(wallet, bannablePolicyId), 0);

        vm.prank(creator);
        zkPassportCredentials.unbanBatch(_bothWallets(), bannablePolicyId);
        assertFalse(zkPassportCredentials.banned(wallet, bannablePolicyId));
    }

    function testEmptyBanAndUnbanBatchesChangeNothing() public {
        vm.recordLogs();
        vm.prank(creator);
        zkPassportCredentials.banBatch(new address[](0), bannablePolicyId);
        vm.prank(creator);
        zkPassportCredentials.unbanBatch(new address[](0), bannablePolicyId);
        assertEq(vm.getRecordedLogs().length, 0);
    }

    function _addIssuer(address account) internal {
        vm.prank(creator);
        zkPassportCredentials.addIssuer(account, bannablePolicyId);
    }

    function _bothWallets() internal view returns (address[] memory wallets) {
        wallets = new address[](2);
        wallets[0] = wallet;
        wallets[1] = otherWallet;
    }
}
