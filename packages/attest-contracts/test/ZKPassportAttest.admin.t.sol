// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";

contract ZKPassportAttestAdminTest is AttestTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
    }

    function testAdminAndGuardianCanPauseIssue() public {
        vm.prank(guardian);
        attest.pause();
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__Paused.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testOthersCannotPause() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__NotAuthorized.selector);
        attest.pause();
    }

    function testOnlyAdminCanUnpause() public {
        vm.prank(admin);
        attest.pause();
        vm.prank(guardian);
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__NotAuthorized.selector);
        attest.unpause();
        vm.prank(admin);
        attest.unpause();
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testPauseDoesNotAffectBalanceOfAndRevoke() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(admin);
        attest.pause();
        assertEq(attest.balanceOf(wallet, policyId), 1);
        vm.prank(wallet);
        attest.revoke(wallet, policyId);
        assertEq(attest.balanceOf(wallet, policyId), 0);
    }

    function testPauseDoesNotAffectCreatePolicy() public {
        vm.prank(admin);
        attest.pause();
        vm.prank(creator);
        attest.createPolicy(bytes32(uint256(99)), 1 days, false, false, 0, false, noCountries, "x");
    }

    function testTransferAdmin() public {
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        attest.transferAdmin(newAdmin);
        assertEq(attest.admin(), newAdmin);
        vm.prank(newAdmin);
        attest.pause();
    }

    function testSetGuardian() public {
        address newGuardian = makeAddr("newGuardian");
        vm.prank(admin);
        attest.setGuardian(newGuardian);
        assertEq(attest.guardian(), newGuardian);
    }

    function testCannotTransferAdminToZero() public {
        vm.prank(admin);
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__ZeroAddress.selector);
        attest.transferAdmin(address(0));
    }
}
