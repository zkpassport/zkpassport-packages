// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";

contract ZKPassportCredentialsRetireTest is ZKPassportCredentialsTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
    }

    function testOwnerCanRetire() public {
        vm.prank(creator);
        vm.expectEmit(true, false, false, false);
        emit ZKPassportCredentials.PolicyRetired(policyId);
        zkPassportCredentials.retire(policyId);
        assertEq(zkPassportCredentials.getPolicy(policyId).retiredAt, uint64(block.timestamp));
    }

    function testNonOwnerCannotRetire() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.retire(policyId);

        vm.prank(admin);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.retire(policyId);
    }

    function testRetireTwiceReverts() public {
        vm.prank(creator);
        zkPassportCredentials.retire(policyId);
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyRetired.selector, policyId)
        );
        zkPassportCredentials.retire(policyId);
    }

    function testRetireUnknownPolicyReverts() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.retire(uint256(999));
    }

    function testIssueRevertsForRetiredPolicy() public {
        vm.prank(creator);
        zkPassportCredentials.retire(policyId);
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyRetired.selector, policyId)
        );
        zkPassportCredentials.issue(policyId, _params());
    }

    function testRenewalRevertsAfterRetirement() public {
        zkPassportCredentials.issue(policyId, _params());
        vm.prank(creator);
        zkPassportCredentials.retire(policyId);
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyRetired.selector, policyId)
        );
        zkPassportCredentials.issue(policyId, _params());
    }

    function testExistingCredentialSurvivesRetirementUntilExpiry() public {
        zkPassportCredentials.issue(policyId, _params());
        vm.prank(creator);
        zkPassportCredentials.retire(policyId);

        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);

        vm.warp(uint256(zkPassportCredentials.heldUntil(wallet, policyId)) + 1);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 0);
    }

    function testRevokeStillWorksAfterRetirement() public {
        zkPassportCredentials.issue(policyId, _params());
        vm.prank(creator);
        zkPassportCredentials.retire(policyId);
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, policyId);
        assertEq(zkPassportCredentials.heldUntil(wallet, policyId), 0);
    }
}
