// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";

contract ZKPassportCredentialsOwnerIssueTest is ZKPassportCredentialsTestBase {
    uint256 internal ownerIssuablePolicyId;
    uint256 internal proofOnlyPolicyId;
    address internal recipient = makeAddr("recipient");
    address internal otherRecipient = makeAddr("other recipient");
    address internal issuer = makeAddr("issuer");

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        ownerIssuablePolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(31)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://policy.example/owner-issuable",
            true,
            true,
            true,
            false
        );
        proofOnlyPolicyId = _createDefaultPolicy();
    }

    function testOwnerCanIssueWithoutProof() public {
        vm.prank(creator);
        vm.expectEmit(true, true, true, true);
        emit ZKPassportCredentials.CredentialIssuedBy(
            recipient, ownerIssuablePolicyId, creator, uint64(block.timestamp + 7 days)
        );
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
        assertEq(zkPassportCredentials.balanceOf(recipient, ownerIssuablePolicyId), 1);
        assertEq(zkPassportCredentials.heldUntil(recipient, ownerIssuablePolicyId), uint64(block.timestamp + 7 days));
    }

    function testOwnerIssueAgainExtendsHeldUntil() public {
        vm.prank(creator);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
        vm.warp(block.timestamp + 3 days);
        vm.prank(creator);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
        assertEq(zkPassportCredentials.heldUntil(recipient, ownerIssuablePolicyId), uint64(block.timestamp + 7 days));
        assertEq(zkPassportCredentials.balanceOf(recipient, ownerIssuablePolicyId), 1);
    }

    function testOwnerIssueRevertsOnProofOnlyPolicy() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotIssuableByOwner.selector);
        zkPassportCredentials.ownerIssue(recipient, proofOnlyPolicyId);
    }

    function testOthersCannotOwnerIssue() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
    }

    function testOwnerIssueRevertsWhenPaused() public {
        vm.prank(admin);
        zkPassportCredentials.pause();
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__Paused.selector);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
    }

    function testOwnerIssueRevertsWhenRetired() public {
        vm.prank(creator);
        zkPassportCredentials.retire(ownerIssuablePolicyId);
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__PolicyRetired.selector, ownerIssuablePolicyId
            )
        );
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
    }

    function testOwnerIssueRevertsOnZeroRecipient() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.ownerIssue(address(0), ownerIssuablePolicyId);
    }

    function testOwnerIssueDoesNotBindNullifiers() public {
        vm.prank(creator);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
        // The document that proves afterwards is unaffected by the owner issuance: its
        // nullifier is unbound and issues to the proof-bound wallet normally.
        zkPassportCredentials.issue(ownerIssuablePolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, ownerIssuablePolicyId), 1);
        assertEq(zkPassportCredentials.balanceOf(recipient, ownerIssuablePolicyId), 1);
    }

    function testOwnerCanBanAnOwnerIssuedCredential() public {
        vm.prank(creator);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
        vm.prank(creator);
        zkPassportCredentials.ban(recipient, ownerIssuablePolicyId);
        assertEq(zkPassportCredentials.balanceOf(recipient, ownerIssuablePolicyId), 0);
    }

    function testStoresOwnerIssuableFlag() public {
        assertTrue(zkPassportCredentials.getPolicy(ownerIssuablePolicyId).ownerIssuable);
        assertFalse(zkPassportCredentials.getPolicy(proofOnlyPolicyId).ownerIssuable);
    }

    function _addIssuer(address account) internal {
        vm.prank(creator);
        zkPassportCredentials.addIssuer(account, ownerIssuablePolicyId);
    }

    function testAddIssuerStoresIssuer() public {
        vm.expectEmit(true, true, false, false);
        emit ZKPassportCredentials.IssuerAdded(ownerIssuablePolicyId, issuer);
        _addIssuer(issuer);

        assertTrue(zkPassportCredentials.isIssuer(issuer, ownerIssuablePolicyId));
    }

    function testIssuerOfOnePolicyCannotIssueForAnother() public {
        vm.prank(creator);
        uint256 otherPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(32)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://policy.example/other-owner-issuable",
            false,
            true,
            false,
            false
        );
        _addIssuer(issuer);

        assertFalse(zkPassportCredentials.isIssuer(issuer, otherPolicyId));
        vm.prank(issuer);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
        zkPassportCredentials.ownerIssue(recipient, otherPolicyId);
    }

    function testIssuerCanIssueWithoutProof() public {
        _addIssuer(issuer);

        vm.prank(issuer);
        vm.expectEmit(true, true, true, true);
        emit ZKPassportCredentials.CredentialIssuedBy(
            recipient, ownerIssuablePolicyId, issuer, uint64(block.timestamp + 7 days)
        );
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
        assertEq(zkPassportCredentials.balanceOf(recipient, ownerIssuablePolicyId), 1);
    }

    function testAddIssuerRevertsOnProofOnlyPolicy() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotIssuableByOwner.selector);
        zkPassportCredentials.addIssuer(issuer, proofOnlyPolicyId);
    }

    function testAddIssuerRevertsOnZeroAddress() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.addIssuer(address(0), ownerIssuablePolicyId);
    }

    function testAddIssuerRevertsOnExistingIssuer() public {
        _addIssuer(issuer);
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__AlreadyIssuer.selector);
        zkPassportCredentials.addIssuer(issuer, ownerIssuablePolicyId);
    }

    function testOnlyPolicyOwnerCanManageIssuers() public {
        _addIssuer(issuer);

        vm.prank(issuer);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.addIssuer(makeAddr("another issuer"), ownerIssuablePolicyId);

        vm.prank(issuer);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.removeIssuer(issuer, ownerIssuablePolicyId);
    }

    function testRemovedIssuerCannotIssue() public {
        _addIssuer(issuer);

        vm.prank(creator);
        vm.expectEmit(true, true, false, false);
        emit ZKPassportCredentials.IssuerRemoved(ownerIssuablePolicyId, issuer);
        zkPassportCredentials.removeIssuer(issuer, ownerIssuablePolicyId);

        vm.prank(issuer);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
        assertFalse(zkPassportCredentials.isIssuer(issuer, ownerIssuablePolicyId));
    }

    function testRemoveIssuerKeepsTheOtherIssuers() public {
        address secondIssuer = makeAddr("second issuer");
        address thirdIssuer = makeAddr("third issuer");
        _addIssuer(issuer);
        _addIssuer(secondIssuer);
        _addIssuer(thirdIssuer);

        vm.prank(creator);
        zkPassportCredentials.removeIssuer(issuer, ownerIssuablePolicyId);

        assertTrue(zkPassportCredentials.isIssuer(secondIssuer, ownerIssuablePolicyId));
        assertTrue(zkPassportCredentials.isIssuer(thirdIssuer, ownerIssuablePolicyId));
        vm.prank(secondIssuer);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
        vm.prank(thirdIssuer);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);
    }

    function testRemoveIssuerRevertsWhenNotAnIssuer() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotIssuer.selector);
        zkPassportCredentials.removeIssuer(issuer, ownerIssuablePolicyId);
    }

    function testRemovingAnIssuerKeepsItsCredentials() public {
        _addIssuer(issuer);
        vm.prank(issuer);
        zkPassportCredentials.ownerIssue(recipient, ownerIssuablePolicyId);

        vm.prank(creator);
        zkPassportCredentials.removeIssuer(issuer, ownerIssuablePolicyId);

        assertEq(zkPassportCredentials.balanceOf(recipient, ownerIssuablePolicyId), 1);
    }

    function testOwnerIssueBatchIssuesEveryWallet() public {
        address[] memory wallets = new address[](2);
        wallets[0] = recipient;
        wallets[1] = otherRecipient;
        uint64 expectedHeldUntil = uint64(block.timestamp + 7 days);

        vm.expectEmit(true, true, true, true);
        emit ZKPassportCredentials.CredentialIssuedBy(recipient, ownerIssuablePolicyId, creator, expectedHeldUntil);
        vm.expectEmit(true, true, true, true);
        emit ZKPassportCredentials.CredentialIssuedBy(otherRecipient, ownerIssuablePolicyId, creator, expectedHeldUntil);
        vm.prank(creator);
        zkPassportCredentials.ownerIssueBatch(wallets, ownerIssuablePolicyId);

        assertEq(zkPassportCredentials.balanceOf(recipient, ownerIssuablePolicyId), 1);
        assertEq(zkPassportCredentials.balanceOf(otherRecipient, ownerIssuablePolicyId), 1);
    }

    function testIssuerCanIssueBatch() public {
        _addIssuer(issuer);
        address[] memory wallets = new address[](2);
        wallets[0] = recipient;
        wallets[1] = otherRecipient;

        vm.prank(issuer);
        zkPassportCredentials.ownerIssueBatch(wallets, ownerIssuablePolicyId);

        assertEq(zkPassportCredentials.balanceOf(recipient, ownerIssuablePolicyId), 1);
        assertEq(zkPassportCredentials.balanceOf(otherRecipient, ownerIssuablePolicyId), 1);
    }

    function testOwnerIssueBatchRevertsEntirelyOnABannedWallet() public {
        vm.prank(creator);
        zkPassportCredentials.ban(otherRecipient, ownerIssuablePolicyId);
        address[] memory wallets = new address[](2);
        wallets[0] = recipient;
        wallets[1] = otherRecipient;

        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WalletBanned.selector);
        zkPassportCredentials.ownerIssueBatch(wallets, ownerIssuablePolicyId);

        assertEq(zkPassportCredentials.heldUntil(recipient, ownerIssuablePolicyId), 0);
    }

    function testOwnerIssueBatchRevertsEntirelyOnAZeroWallet() public {
        address[] memory wallets = new address[](2);
        wallets[0] = recipient;

        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.ownerIssueBatch(wallets, ownerIssuablePolicyId);

        assertEq(zkPassportCredentials.heldUntil(recipient, ownerIssuablePolicyId), 0);
    }

    function testOthersCannotOwnerIssueBatch() public {
        address[] memory wallets = new address[](1);
        wallets[0] = recipient;

        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotOwnerOrIssuer.selector);
        zkPassportCredentials.ownerIssueBatch(wallets, ownerIssuablePolicyId);
    }

    function testOwnerIssueBatchRevertsOnProofOnlyPolicy() public {
        address[] memory wallets = new address[](1);
        wallets[0] = recipient;

        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotIssuableByOwner.selector);
        zkPassportCredentials.ownerIssueBatch(wallets, proofOnlyPolicyId);
    }

    function testOwnerIssueBatchRevertsWhenPaused() public {
        address[] memory wallets = new address[](1);
        wallets[0] = recipient;
        vm.prank(admin);
        zkPassportCredentials.pause();

        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__Paused.selector);
        zkPassportCredentials.ownerIssueBatch(wallets, ownerIssuablePolicyId);
    }
}
