// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {MockEvaluatorV2} from "./mocks/MockEvaluatorV2.sol";

contract ZKPassportCredentialsEvaluatorSwapTest is ZKPassportCredentialsTestBase {
    MockEvaluatorV2 internal evaluatorV2;
    bytes internal v2Requirements = abi.encode(uint256(18));

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        evaluatorV2 = new MockEvaluatorV2();
    }

    function _swapToV2() internal {
        vm.prank(admin);
        zkPassportCredentials.setPolicyEvaluator(evaluatorV2);
    }

    function _createV2Policy() internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(uint256(51)), v2Requirements, 30 days, "https://p.example/v2", false, false
        );
    }

    function testCreatePolicyValidatesUnderTheCurrentEvaluator() public {
        // V2-shaped bytes are a single word; V1's struct decode reverts on them.
        vm.prank(creator);
        vm.expectRevert();
        zkPassportCredentials.createPolicy(
            bytes32(uint256(51)), v2Requirements, 30 days, "https://p.example/v2", false, false
        );

        _swapToV2();
        uint256 policyId = _createV2Policy();
        assertEq(zkPassportCredentials.getPolicy(policyId).evaluator, address(evaluatorV2));
    }

    function testV2SchemaValidationRunsAtCreation() public {
        _swapToV2();
        vm.prank(creator);
        vm.expectRevert(MockEvaluatorV2.MockEvaluatorV2__InvalidRequirements.selector);
        zkPassportCredentials.createPolicy(bytes32(uint256(52)), abi.encode(uint256(200)), 30 days, "x", false, false);
    }

    function testPoliciesIssueUnderTheirOwnSchema() public {
        vm.prank(creator);
        uint256 v1PolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(53)),
            _requirements(NullifierType.SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "x",
            false,
            false
        );
        _swapToV2();
        uint256 v2PolicyId = _createV2Policy();

        // The V1 policy still enforces its own schema: the nullifier is consumed.
        zkPassportCredentials.issue(v1PolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.nullifierWallet(v1PolicyId, mockVerifier.nullifier()), wallet);

        // The V2 policy is judged by V2: age passes, never unique, so no binding.
        zkPassportCredentials.issue(v2PolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, v2PolicyId), 1);
        assertEq(zkPassportCredentials.nullifierWallet(v2PolicyId, mockVerifier.nullifier()), address(0));
    }

    function testV2RequirementFailureRevertsIssue() public {
        _swapToV2();
        uint256 v2PolicyId = _createV2Policy();
        mockHelper.setAgeOk(false);
        vm.expectRevert(MockEvaluatorV2.MockEvaluatorV2__AgeNotMet.selector);
        zkPassportCredentials.issue(v2PolicyId, _params());
    }
}
