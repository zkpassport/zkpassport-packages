// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType, ProofVerificationParams} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {CredentialIssuanceModuleV1} from "../src/CredentialIssuanceModuleV1.sol";

contract ZKPassportCredentialsNullifierTypeTest is ZKPassportCredentialsTestBase {
    uint256 internal saltedPolicyId;
    uint256 internal nonSaltedPolicyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        saltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(21)),
            7 days,
            false,
            _requirements(NullifierType.SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            "https://p.example/s"
        );
        vm.prank(creator);
        nonSaltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(22)),
            7 days,
            false,
            _requirements(NullifierType.NON_SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            "https://p.example/n"
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

    function testUnrestrictedPolicyRejectsMockNullifierTypes() public {
        uint256 defaultPolicyId = _createDefaultPolicy();
        vm.expectRevert(CredentialIssuanceModuleV1.CredentialIssuanceModule__MockProofNotAllowed.selector);
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER));
        vm.expectRevert(CredentialIssuanceModuleV1.CredentialIssuanceModule__MockProofNotAllowed.selector);
        zkPassportCredentials.issue(defaultPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
    }

    function testSaltedPolicyRejectsMockSaltedNullifier() public {
        vm.expectRevert(CredentialIssuanceModuleV1.CredentialIssuanceModule__MockProofNotAllowed.selector);
        zkPassportCredentials.issue(saltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
    }
}
