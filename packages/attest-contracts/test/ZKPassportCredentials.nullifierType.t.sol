// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType, ProofVerificationParams} from "@registry/lib/Types.sol";
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
            _requirements(NullifierType.SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://p.example/s",
            false,
            false
        );
        vm.prank(creator);
        nonSaltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(22)),
            _requirements(NullifierType.NON_SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://p.example/n",
            false,
            false
        );
    }

    function testCreatePolicyStoresNullifierType() public {
        assertEq(
            uint8(
                evaluator.decodeRequirements(zkPassportCredentials.getPolicy(saltedPolicyId).requirements)
                .uniqueIdentifierType
            ),
            uint8(NullifierType.SALTED_NULLIFIER)
        );
        uint256 defaultPolicyId = _createDefaultPolicy();
        assertEq(
            uint8(
                evaluator.decodeRequirements(zkPassportCredentials.getPolicy(defaultPolicyId).requirements)
                .uniqueIdentifierType
            ),
            uint8(NullifierType.NONE_NULLIFIER)
        );
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

    function testUnrestrictedPolicyAcceptsEveryRealNullifierType() public {
        uint256 defaultPolicyId = _createDefaultPolicy();
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, defaultPolicyId), 1);
    }

    function testUnrestrictedPolicyAcceptsMockNullifierTypes() public {
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

    function testMockSaltedPolicyMatchesMockSaltedNullifierExactly() public {
        vm.prank(creator);
        uint256 mockSaltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(23)),
            _requirements(NullifierType.SALTED_MOCK_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://p.example/ms",
            false,
            false
        );
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(mockSaltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));

        zkPassportCredentials.issue(mockSaltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, mockSaltedPolicyId), 1);
    }
}
