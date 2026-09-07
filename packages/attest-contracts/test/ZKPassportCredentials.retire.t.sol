// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";

contract ZKPassportCredentialsRetireTest is AttestTestBase {
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
        attest.retire(policyId);
        assertEq(attest.getPolicy(policyId).retiredAt, uint64(block.timestamp));
    }

    function testNonOwnerCannotRetire() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        attest.retire(policyId);

        vm.prank(guardian);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        attest.retire(policyId);

        vm.prank(admin);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        attest.retire(policyId);
    }

    function testRetireTwiceReverts() public {
        vm.prank(creator);
        attest.retire(policyId);
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyRetired.selector, policyId)
        );
        attest.retire(policyId);
    }

    function testRetireUnknownPolicyReverts() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        attest.retire(uint256(999));
    }

    function testIssueRevertsForRetiredPolicy() public {
        vm.prank(creator);
        attest.retire(policyId);
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyRetired.selector, policyId)
        );
        attest.issue(wallet, policyId, _params());
    }

    function testRenewalRevertsAfterRetirement() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(creator);
        attest.retire(policyId);
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyRetired.selector, policyId)
        );
        attest.issue(wallet, policyId, _params());
    }

    function testExistingCredentialSurvivesRetirementUntilExpiry() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(creator);
        attest.retire(policyId);

        assertEq(attest.balanceOf(wallet, policyId), 1);

        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        assertEq(attest.balanceOf(wallet, policyId), 0);
    }

    function testRevokeStillWorksAfterRetirement() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(creator);
        attest.retire(policyId);
        vm.prank(wallet);
        attest.revoke(wallet, policyId);
        assertEq(attest.heldUntil(wallet, policyId), 0);
    }
}
