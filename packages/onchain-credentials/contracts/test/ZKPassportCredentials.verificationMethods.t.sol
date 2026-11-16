// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {FaceMatchMode} from "@registry/lib/Types.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";

/// The verification methods a policy accepts
contract ZKPassportCredentialsVerificationMethodsTest is ZKPassportCredentialsTestBase {
    function setUp() public {
        _deployWithMocks();
    }

    function _schemes(uint256 a) internal pure returns (uint256[] memory list) {
        list = new uint256[](1);
        list[0] = a;
    }

    function _schemes(uint256 a, uint256 b) internal pure returns (uint256[] memory list) {
        list = new uint256[](2);
        list[0] = a;
        list[1] = b;
    }

    function _requirements(uint256[] memory allowedVerificationMethods, uint8 minAge)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(
            PolicyEvaluatorV1.PolicyRequirements({
                minAge: minAge,
                sanctionsMode: PolicyEvaluatorV1.SanctionsMode.NONE,
                faceMatchMode: FaceMatchMode.NONE,
                includedNationalities: noCountries,
                excludedNationalities: noCountries,
                allowedVerificationMethods: allowedVerificationMethods
            })
        );
    }

    uint256 internal salt;

    function _createPolicy(bytes memory requirements) internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(++salt), requirements, 30 days, "https://policy.example/1", false, false, false, false
        );
    }

    function _issueWithScheme(uint256 policyId, uint256 scheme) internal {
        mockHelper.setVerificationMethod(scheme);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testAnEmptyListAcceptsTier1Only() public {
        uint256 policyId = _createPolicy(_requirements(new uint256[](0), 0));
        _issueWithScheme(policyId, 100);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);

        mockHelper.setVerificationMethod(200);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__VerificationMethodNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setVerificationMethod(201);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__VerificationMethodNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testAWholeTierAcceptsEachOfItsSchemes() public {
        uint256 policyId = _createPolicy(_requirements(_schemes(1, 2), 0));
        _issueWithScheme(policyId, 200);
        _issueWithScheme(policyId, 201);
        _issueWithScheme(policyId, 101);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testAnExactSchemeAcceptsOnlyItself() public {
        uint256 policyId = _createPolicy(_requirements(_schemes(1, 201), 0));
        _issueWithScheme(policyId, 201);
        mockHelper.setVerificationMethod(200);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__VerificationMethodNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testATier2OnlyPolicyRefusesChipReads() public {
        uint256 policyId = _createPolicy(_requirements(_schemes(2), 0));
        mockHelper.setVerificationMethod(100);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__VerificationMethodNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testAHelperFailingForAnotherReasonIsNotTakenForAChipRead() public {
        mockHelper.setVerificationMethod(200);
        mockHelper.setBroken(true);
        uint256 tier1 = _createPolicy(_requirements(new uint256[](0), 0));
        vm.expectRevert(bytes("helper failed"));
        zkPassportCredentials.issue(tier1, _params());
    }

    function testAProofFromBeforeTheSchemeExistedIsAChipRead() public {
        mockHelper.setLegacy(true);
        uint256 tier1 = _createPolicy(_requirements(new uint256[](0), 0));
        zkPassportCredentials.issue(tier1, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, tier1), 1);

        uint256 tier2Only = _createPolicy(_requirements(_schemes(200), 0));
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__VerificationMethodNotAllowed.selector);
        zkPassportCredentials.issue(tier2Only, _params());
    }

    function testOtherChecksStillApply() public {
        uint256 policyId = _createPolicy(_requirements(_schemes(1, 2), 18));
        mockHelper.setAgeOk(false);
        mockHelper.setVerificationMethod(200);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__AgeRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testUnknownSchemesAreRefusedAtCreation() public {
        uint256[4] memory bad = [uint256(0), 3, 202, 999];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidVerificationMethods.selector);
            evaluator.validateRequirements(_requirements(_schemes(bad[i]), 0));
        }
        evaluator.validateRequirements(_requirements(_schemes(1, 2), 0));
        evaluator.validateRequirements(_requirements(_schemes(100, 201), 0));
    }
}
