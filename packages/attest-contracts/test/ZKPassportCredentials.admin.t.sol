// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
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

    function testPauseBlocksCreatePolicy() public {
        vm.prank(admin);
        zkPassportCredentials.pause();
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__Paused.selector);
        zkPassportCredentials.createPolicy(
            bytes32(uint256(99)),
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER,
                0,
                PolicyEvaluatorV1.SanctionsMode.NONE,
                noCountries
            ),
            1 days,
            "x",
            false,
            false
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

    function testAdminCanSwapPolicyEvaluator() public {
        PolicyEvaluatorV1 newEvaluator = new PolicyEvaluatorV1(IRootVerifier(address(mockVerifier)), true);
        vm.prank(admin);
        vm.expectEmit(true, true, false, false);
        emit ZKPassportCredentials.PolicyEvaluatorUpdated(address(evaluator), address(newEvaluator));
        zkPassportCredentials.setPolicyEvaluator(newEvaluator);
        assertEq(address(zkPassportCredentials.policyEvaluator()), address(newEvaluator));
    }

    function testOthersCannotSwapPolicyEvaluator() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotAuthorized.selector);
        zkPassportCredentials.setPolicyEvaluator(evaluator);
    }

    function testCannotSwapPolicyEvaluatorToZero() public {
        vm.prank(admin);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.setPolicyEvaluator(PolicyEvaluatorV1(address(0)));
    }

    function testAdminCanSetDomain() public {
        vm.prank(admin);
        vm.expectEmit(false, false, false, true);
        emit ZKPassportCredentials.DomainUpdated(DOMAIN, "attest.example");
        zkPassportCredentials.setDomain("attest.example");
        assertEq(zkPassportCredentials.domain(), "attest.example");
    }

    function testOthersCannotSetDomain() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotAuthorized.selector);
        zkPassportCredentials.setDomain("attest.example");
    }

    function testIssueVerifiesAgainstTheCurrentDomain() public {
        mockHelper.setExpectedScopes(DOMAIN, zkPassportCredentials.policyScope(policyId));
        vm.prank(admin);
        zkPassportCredentials.setDomain("attest.example");
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongScope.selector);
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setExpectedScopes("attest.example", zkPassportCredentials.policyScope(policyId));
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testCannotTransferAdminToZero() public {
        vm.prank(admin);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.transferAdmin(address(0));
    }
}
