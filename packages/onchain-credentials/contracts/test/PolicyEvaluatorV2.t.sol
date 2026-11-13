// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {FaceMatchMode, NullifierType} from "@registry/lib/Types.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {PolicyEvaluatorV2} from "../src/PolicyEvaluatorV2.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";

/// PolicyEvaluatorV2: V1's checks plus the credential schemes a policy accepts
contract PolicyEvaluatorV2Test is ZKPassportCredentialsTestBase {
    PolicyEvaluatorV2 internal evaluatorV2;

    function setUp() public {
        _deployWithMocks();
        evaluatorV2 = new PolicyEvaluatorV2(IRootVerifier(address(mockVerifier)), true, NullifierType.SALTED_NULLIFIER);
        vm.prank(admin);
        zkPassportCredentials.setPolicyEvaluator(evaluatorV2);
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

    function _requirementsV2(uint256[] memory allowedCredentialSchemes, uint8 minAge)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(
            PolicyEvaluatorV2.PolicyRequirements({
                minAge: minAge,
                sanctionsMode: PolicyEvaluatorV2.SanctionsMode.NONE,
                faceMatchMode: FaceMatchMode.NONE,
                includedNationalities: noCountries,
                excludedNationalities: noCountries,
                allowedCredentialSchemes: allowedCredentialSchemes
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
        mockHelper.setCredentialScheme(scheme);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testSchemaVersion() public view {
        assertEq(evaluatorV2.schemaVersion(), 2);
    }

    function testAnEmptyListAcceptsTier1Only() public {
        uint256 policyId = _createPolicy(_requirementsV2(new uint256[](0), 0));
        _issueWithScheme(policyId, 100);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);

        mockHelper.setCredentialScheme(200);
        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__CredentialSchemeNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setCredentialScheme(201);
        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__CredentialSchemeNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testAWholeTierAcceptsEachOfItsSchemes() public {
        uint256 policyId = _createPolicy(_requirementsV2(_schemes(1, 2), 0));
        _issueWithScheme(policyId, 200);
        _issueWithScheme(policyId, 201);
        _issueWithScheme(policyId, 101);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testAnExactSchemeAcceptsOnlyItself() public {
        uint256 policyId = _createPolicy(_requirementsV2(_schemes(1, 201), 0));
        _issueWithScheme(policyId, 201);
        mockHelper.setCredentialScheme(200);
        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__CredentialSchemeNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testATier2OnlyPolicyRefusesChipReads() public {
        uint256 policyId = _createPolicy(_requirementsV2(_schemes(2), 0));
        mockHelper.setCredentialScheme(100);
        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__CredentialSchemeNotAllowed.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testAProofFromBeforeTheSchemeExistedIsAChipRead() public {
        mockHelper.setLegacy(true);
        uint256 tier1 = _createPolicy(_requirementsV2(new uint256[](0), 0));
        zkPassportCredentials.issue(tier1, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, tier1), 1);

        uint256 tier2Only = _createPolicy(_requirementsV2(_schemes(200), 0));
        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__CredentialSchemeNotAllowed.selector);
        zkPassportCredentials.issue(tier2Only, _params());
    }

    function testV1ChecksStillApply() public {
        uint256 policyId = _createPolicy(_requirementsV2(_schemes(1, 2), 18));
        mockHelper.setAgeOk(false);
        mockHelper.setCredentialScheme(200);
        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__AgeRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testUnknownSchemesAreRefusedAtCreation() public {
        uint256[4] memory bad = [uint256(0), 3, 202, 999];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__InvalidCredentialSchemes.selector);
            evaluatorV2.validateRequirements(_requirementsV2(_schemes(bad[i]), 0));
        }
        evaluatorV2.validateRequirements(_requirementsV2(_schemes(1, 2), 0));
        evaluatorV2.validateRequirements(_requirementsV2(_schemes(100, 201), 0));
    }

    function testAV1PolicyIsUnaffectedBySwappingTheEvaluator() public view {
        // Policies keep the evaluator recorded at their creation
        assertEq(address(zkPassportCredentials.policyEvaluator()), address(evaluatorV2));
        assertTrue(address(evaluator) != address(evaluatorV2));
    }
}
