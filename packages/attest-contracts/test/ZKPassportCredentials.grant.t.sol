// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";

contract ZKPassportCredentialsGrantTest is ZKPassportCredentialsTestBase {
    uint256 internal grantablePolicyId;
    uint256 internal proofOnlyPolicyId;
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        grantablePolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(31)),
            7 days,
            true,
            _requirements(NullifierType.SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            "https://policy.example/grantable"
        );
        proofOnlyPolicyId = _createDefaultPolicy();
    }

    function testOwnerCanGrant() public {
        vm.prank(creator);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialGranted(recipient, grantablePolicyId, uint64(block.timestamp + 7 days));
        zkPassportCredentials.grant(recipient, grantablePolicyId);
        assertEq(zkPassportCredentials.balanceOf(recipient, grantablePolicyId), 1);
        assertEq(zkPassportCredentials.heldUntil(recipient, grantablePolicyId), uint64(block.timestamp + 7 days));
    }

    function testGrantAgainExtendsHeldUntil() public {
        vm.prank(creator);
        zkPassportCredentials.grant(recipient, grantablePolicyId);
        vm.warp(block.timestamp + 3 days);
        vm.prank(creator);
        zkPassportCredentials.grant(recipient, grantablePolicyId);
        assertEq(zkPassportCredentials.heldUntil(recipient, grantablePolicyId), uint64(block.timestamp + 7 days));
        assertEq(zkPassportCredentials.balanceOf(recipient, grantablePolicyId), 1);
    }

    function testGrantRevertsOnProofOnlyPolicy() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotGrantable.selector);
        zkPassportCredentials.grant(recipient, proofOnlyPolicyId);
    }

    function testOthersCannotGrant() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.grant(recipient, grantablePolicyId);
    }

    function testGrantRevertsWhenPaused() public {
        vm.prank(admin);
        zkPassportCredentials.pause();
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__Paused.selector);
        zkPassportCredentials.grant(recipient, grantablePolicyId);
    }

    function testGrantRevertsWhenRetired() public {
        vm.prank(creator);
        zkPassportCredentials.retire(grantablePolicyId);
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__PolicyRetired.selector, grantablePolicyId
            )
        );
        zkPassportCredentials.grant(recipient, grantablePolicyId);
    }

    function testGrantRevertsOnZeroRecipient() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.grant(address(0), grantablePolicyId);
    }

    function testGrantDoesNotBindNullifiers() public {
        vm.prank(creator);
        zkPassportCredentials.grant(recipient, grantablePolicyId);
        // The document that proves afterwards is unaffected by the grant: its
        // nullifier is unbound and issues to the proof-bound wallet normally.
        zkPassportCredentials.issue(grantablePolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, grantablePolicyId), 1);
        assertEq(zkPassportCredentials.balanceOf(recipient, grantablePolicyId), 1);
    }

    function testGrantedCredentialIsRevocable() public {
        vm.prank(creator);
        zkPassportCredentials.grant(recipient, grantablePolicyId);
        vm.prank(creator);
        zkPassportCredentials.revoke(recipient, grantablePolicyId);
        assertEq(zkPassportCredentials.balanceOf(recipient, grantablePolicyId), 0);
    }

    function testStoresOwnerGrantableFlag() public {
        assertTrue(zkPassportCredentials.getPolicy(grantablePolicyId).ownerGrantable);
        assertFalse(zkPassportCredentials.getPolicy(proofOnlyPolicyId).ownerGrantable);
    }
}
