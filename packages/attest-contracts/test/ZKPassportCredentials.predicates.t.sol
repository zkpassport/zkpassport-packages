// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {FaceMatchMode, NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";

contract ZKPassportCredentialsPredicatesTest is ZKPassportCredentialsTestBase {
    uint256 internal strictPolicyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        string[] memory excluded = new string[](2);
        excluded[0] = "IRN";
        excluded[1] = "PRK";
        vm.prank(creator);
        strictPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(7)),
            7 days,
            _requirements(NullifierType.SALTED_NULLIFIER, 18, true, excluded),
            "https://policy.example/kyc"
        );
    }

    function testStrictPolicyIssuesWhenAllPredicatesPass() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 1);
    }

    function testIssueRevertsWhenAgeTooLow() public {
        mockHelper.setAgeOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__AgeRequirementNotMet.selector);
        zkPassportCredentials.issue(strictPolicyId, _params());
    }

    function testIssueRevertsOnExcludedNationality() public {
        mockHelper.setNationalityOutOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__ExcludedNationality.selector);
        zkPassportCredentials.issue(strictPolicyId, _params());
    }

    function _createPolicyWith(PolicyEvaluatorV1.PolicyRequirements memory r, uint256 salt) internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(bytes32(salt), 7 days, abi.encode(r), "https://policy.example/x");
    }

    function testAgeUpperBoundPredicate() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.NONE_NULLIFIER);
        r.maxAge = 25;
        uint256 policyId = _createPolicyWith(r, 100);
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);

        mockHelper.setAgeOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__AgeRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testAgeRangePredicate() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.NONE_NULLIFIER);
        r.minAge = 18;
        r.maxAge = 25;
        uint256 policyId = _createPolicyWith(r, 101);
        zkPassportCredentials.issue(policyId, _params());

        mockHelper.setAgeOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__AgeRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testBirthdatePredicates() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.NONE_NULLIFIER);
        r.minBirthdate = 631_152_000;
        uint256 lowerOnly = _createPolicyWith(r, 102);
        r.maxBirthdate = 946_684_800;
        uint256 range = _createPolicyWith(r, 103);
        r.minBirthdate = 0;
        uint256 upperOnly = _createPolicyWith(r, 104);

        zkPassportCredentials.issue(lowerOnly, _params());
        zkPassportCredentials.issue(range, _params());
        zkPassportCredentials.issue(upperOnly, _params());

        mockHelper.setBirthdateOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__BirthdateRequirementNotMet.selector);
        zkPassportCredentials.issue(range, _params());
    }

    function testExpiryDatePredicates() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.NONE_NULLIFIER);
        r.minExpiryDate = 1_700_000_000;
        uint256 lowerOnly = _createPolicyWith(r, 105);
        r.maxExpiryDate = 1_900_000_000;
        uint256 range = _createPolicyWith(r, 106);
        r.minExpiryDate = 0;
        uint256 upperOnly = _createPolicyWith(r, 107);

        zkPassportCredentials.issue(lowerOnly, _params());
        zkPassportCredentials.issue(range, _params());
        zkPassportCredentials.issue(upperOnly, _params());

        mockHelper.setExpiryDateOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__ExpiryDateRequirementNotMet.selector);
        zkPassportCredentials.issue(range, _params());
    }

    function testNationalityInclusionPredicate() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.NONE_NULLIFIER);
        string[] memory included = new string[](2);
        included[0] = "ARG";
        included[1] = "FRA";
        r.includedNationalities = included;
        uint256 policyId = _createPolicyWith(r, 108);
        zkPassportCredentials.issue(policyId, _params());

        mockHelper.setNationalityInOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__NationalityNotIncluded.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testIssuingCountryPredicates() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.NONE_NULLIFIER);
        string[] memory included = new string[](1);
        included[0] = "FRA";
        string[] memory excluded = new string[](1);
        excluded[0] = "PRK";
        r.includedIssuingCountries = included;
        r.excludedIssuingCountries = excluded;
        uint256 policyId = _createPolicyWith(r, 109);
        zkPassportCredentials.issue(policyId, _params());

        mockHelper.setIssuingCountryInOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__IssuingCountryNotIncluded.selector);
        zkPassportCredentials.issue(policyId, _params());

        mockHelper.setIssuingCountryInOk(true);
        mockHelper.setIssuingCountryOutOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__ExcludedIssuingCountry.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testFaceMatchPredicate() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.NONE_NULLIFIER);
        r.faceMatchMode = FaceMatchMode.STRICT;
        uint256 policyId = _createPolicyWith(r, 110);
        zkPassportCredentials.issue(policyId, _params());

        mockHelper.setFaceMatchOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__FaceMatchRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testIssueRevertsWhenSanctionsRootInvalid() public {
        mockHelper.setSanctionsOk(false);
        vm.expectRevert("MockVerifierHelper: sanctions root invalid");
        zkPassportCredentials.issue(strictPolicyId, _params());
    }

    function testLaxPolicySkipsPredicateCalls() public {
        uint256 laxPolicyId = _createDefaultPolicy();
        mockHelper.setAgeOk(false);
        mockHelper.setNationalityOutOk(false);
        mockHelper.setSanctionsOk(false);
        zkPassportCredentials.issue(laxPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, laxPolicyId), 1);
        assertEq(zkPassportCredentials.nullifierWallet(laxPolicyId, mockVerifier.nullifier()), address(0));
    }

    function testUniquePolicyBindsNullifierToWallet() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        assertEq(zkPassportCredentials.nullifierWallet(strictPolicyId, mockVerifier.nullifier()), wallet);
    }

    function testSamePassportOtherWalletIsSybil() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        address mallory = makeAddr("mallory");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(strictPolicyId, _params());
    }

    function testSamePassportSameWalletCanRenew() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        zkPassportCredentials.issue(strictPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 1);
    }

    function testUniquePolicyRejectsZeroNullifier() public {
        mockVerifier.setNullifier(bytes32(0));
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__MissingNullifier.selector);
        zkPassportCredentials.issue(strictPolicyId, _params());
    }

    function testNullifiersAreScopedPerPolicy() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        vm.prank(creator);
        uint256 secondUnique = zkPassportCredentials.createPolicy(
            bytes32(uint256(8)),
            7 days,
            _requirements(NullifierType.SALTED_NULLIFIER, 0, false, noCountries),
            "https://policy.example/2"
        );
        address other = makeAddr("other");
        mockHelper.setBoundData(other, block.chainid, "");
        zkPassportCredentials.issue(secondUnique, _params());
        assertEq(zkPassportCredentials.balanceOf(other, secondUnique), 1);
    }

    function testRevokeKeepsNullifierBoundToOriginalWallet() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, strictPolicyId);
        assertEq(zkPassportCredentials.nullifierWallet(strictPolicyId, mockVerifier.nullifier()), wallet);
        address mallory = makeAddr("recovered");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(strictPolicyId, _params());
    }

    function testSameWalletCanReissueAfterRevoke() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, strictPolicyId);
        zkPassportCredentials.issue(strictPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 1);
    }

    function testActiveCredentialStillBlocksOtherWallets() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        address mallory = makeAddr("mallory2");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(strictPolicyId, _params());
    }
}
