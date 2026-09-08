// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {IssuanceModuleV1} from "../src/IssuanceModuleV1.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";

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
        zkPassportCredentials.issue(policyId, _params());
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
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testPauseDoesNotAffectBalanceOfAndRevoke() public {
        zkPassportCredentials.issue(policyId, _params());
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
        zkPassportCredentials.createPolicy(
            bytes32(uint256(99)),
            1 days,
            address(evaluator),
            _requirements(NullifierType.NONE_NULLIFIER, 0, false, noCountries),
            "x"
        );
    }

    function testTransferAdmin() public {
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        zkPassportCredentials.transferAdmin(newAdmin);
        assertEq(zkPassportCredentials.admin(), newAdmin);
        vm.prank(newAdmin);
        zkPassportCredentials.pause();
    }

    function testAdminCanSwapIssuanceModule() public {
        IssuanceModuleV1 newModule = new IssuanceModuleV1(IRootVerifier(address(mockVerifier)));
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit ZKPassportCredentials.IssuanceModuleUpdated(address(issuanceModule), address(newModule));
        zkPassportCredentials.setIssuanceModule(newModule);
        assertEq(address(zkPassportCredentials.issuanceModule()), address(newModule));
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testOthersCannotSwapIssuanceModule() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotAuthorized.selector);
        zkPassportCredentials.setIssuanceModule(issuanceModule);
    }

    function testCannotSwapIssuanceModuleToZero() public {
        vm.prank(admin);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.setIssuanceModule(IssuanceModuleV1(address(0)));
    }

    function testCannotTransferAdminToZero() public {
        vm.prank(admin);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.transferAdmin(address(0));
    }
}
