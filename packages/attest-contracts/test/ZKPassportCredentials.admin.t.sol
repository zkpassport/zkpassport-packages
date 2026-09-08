// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";

contract ZKPassportCredentialsAdminTest is ZKPassportCredentialsTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
    }

    function testAdminCanPauseIssue() public {
        vm.prank(admin);
        zkPassportCredentials.pause();
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__Paused.selector);
        zkPassportCredentials.issue(wallet, policyId, _params());
    }

    function testOthersCannotPause() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotAuthorized.selector);
        zkPassportCredentials.pause();
    }

    function testOnlyAdminCanUnpause() public {
        vm.prank(admin);
        zkPassportCredentials.pause();
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotAuthorized.selector);
        zkPassportCredentials.unpause();
        vm.prank(admin);
        zkPassportCredentials.unpause();
        zkPassportCredentials.issue(wallet, policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testPauseDoesNotAffectBalanceOfAndRevoke() public {
        zkPassportCredentials.issue(wallet, policyId, _params());
        vm.prank(admin);
        zkPassportCredentials.pause();
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, policyId);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 0);
    }

    function testPauseDoesNotAffectCreatePolicy() public {
        vm.prank(admin);
        zkPassportCredentials.pause();
        vm.prank(creator);
        zkPassportCredentials.createPolicy(bytes32(uint256(99)), 1 days, false, false, 0, false, noCountries, "x");
    }

    function testTransferAdmin() public {
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        zkPassportCredentials.transferAdmin(newAdmin);
        assertEq(zkPassportCredentials.admin(), newAdmin);
        vm.prank(newAdmin);
        zkPassportCredentials.pause();
    }

    function testCannotTransferAdminToZero() public {
        vm.prank(admin);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.transferAdmin(address(0));
    }
}
