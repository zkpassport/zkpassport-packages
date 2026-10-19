// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";

contract ZKPassportCredentialsNullifierTypeTest is ZKPassportCredentialsTestBase {
    uint256 internal saltedPolicyId;
    uint256 internal nonSaltedPolicyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        saltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(21)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://p.example/s",
            true,
            false,
            false,
            false
        );
        // Policies pin the evaluator in force at creation, so both types stay live side by side.
        _swapEvaluator(NullifierType.NON_SALTED_NULLIFIER);
        vm.prank(creator);
        nonSaltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(22)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://p.example/n",
            true,
            false,
            false,
            false
        );
    }

    function testEvaluatorExposesItsUniqueIdentifierType() public view {
        assertEq(uint8(evaluator.uniqueIdentifierType()), uint8(NullifierType.SALTED_NULLIFIER));
        assertEq(
            uint8(
                PolicyEvaluatorV1(zkPassportCredentials.getPolicy(nonSaltedPolicyId).evaluator).uniqueIdentifierType()
            ),
            uint8(NullifierType.NON_SALTED_NULLIFIER)
        );
    }

    function testCreatePolicyStoresEnforceUniqueness() public {
        assertTrue(zkPassportCredentials.getPolicy(saltedPolicyId).enforceUniqueness);
        assertFalse(zkPassportCredentials.getPolicy(_createDefaultPolicy()).enforceUniqueness);
    }

    function testSaltedPolicyAcceptsSaltedNullifier() public {
        zkPassportCredentials.issue(saltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, saltedPolicyId), 1);
    }

    function testSaltedPolicyRejectsNonSaltedNullifier() public {
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(saltedPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
    }

    function testSaltedPolicyRejectsHiddenNullifier() public {
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(saltedPolicyId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
    }

    function testNonSaltedPolicyAcceptsNonSaltedNullifier() public {
        zkPassportCredentials.issue(nonSaltedPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, nonSaltedPolicyId), 1);
    }

    function testNonSaltedPolicyRejectsSaltedNullifier() public {
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(nonSaltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
    }

    function testNonUniquePolicyAcceptsEveryRealNullifierType() public {
        uint256 defaultPolicyId = _createDefaultPolicy();
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, defaultPolicyId), 1);
    }

    function testNonUniquePolicyAcceptsMockNullifierTypes() public {
        uint256 defaultPolicyId = _createDefaultPolicy();
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER));
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, defaultPolicyId), 1);
    }

    function testSaltedPolicyRejectsMockSaltedNullifier() public {
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(saltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
    }

    function testSaltedPolicyRejectsMockNonSaltedNullifier() public {
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(saltedPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER));
    }

    function testNonSaltedPolicyRejectsMockNonSaltedNullifier() public {
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(
            nonSaltedPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER)
        );
    }

    function testNonSaltedPolicyRejectsMockSaltedNullifier() public {
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(nonSaltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
    }

    function testMockSaltedEvaluatorMatchesMockSaltedNullifierExactly() public {
        _swapEvaluator(NullifierType.SALTED_MOCK_NULLIFIER);
        vm.prank(creator);
        uint256 mockSaltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(23)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://p.example/ms",
            true,
            false,
            false,
            false
        );
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(mockSaltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));

        zkPassportCredentials.issue(mockSaltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, mockSaltedPolicyId), 1);
    }
}
