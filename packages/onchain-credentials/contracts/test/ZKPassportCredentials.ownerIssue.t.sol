// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";

contract ZKPassportCredentialsOwnerIssueTest is ZKPassportCredentialsTestBase {
    uint256 internal ownerIssuablePolicyId;
    uint256 internal proofOnlyPolicyId;
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        ownerIssuablePolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(31)),
            _requirements(NullifierType.SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://policy.example/owner-issuable",
            true,
            true,
            false
        );
        proofOnlyPolicyId = _createDefaultPolicy();
    }

    function testOwnerCanIssueWithoutProof() public {
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialIssuedByPolicyOwner(
            recipient, ownerIssuablePolicyId, uint64(block.timestamp + 7 days)
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
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
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
}
