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
            _requirements(18, PolicyEvaluatorV1.SanctionsMode.STRICT, excluded),
            7 days,
            "https://policy.example/kyc",
            true,
            false,
            false,
            false
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
        return zkPassportCredentials.createPolicy(
            bytes32(salt), abi.encode(r), 7 days, "https://policy.example/x", false, false, false, false
        );
    }

    /// @dev Every requirement enabled at once, the shape of a production KYC policy.
    function _fullRequirements() internal view returns (PolicyEvaluatorV1.PolicyRequirements memory r) {
        r = _emptyRequirements();
        r.minAge = 21;
        r.sanctionsMode = PolicyEvaluatorV1.SanctionsMode.STRICT;
        r.faceMatchMode = FaceMatchMode.STRICT;
        r.includedNationalities = new string[](2);
        r.includedNationalities[0] = "ARG";
        r.includedNationalities[1] = "FRA";
        r.excludedNationalities = new string[](2);
        r.excludedNationalities[0] = "IRN";
        r.excludedNationalities[1] = "PRK";
    }

    function _createFullPolicy() internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(uint256(120)),
            abi.encode(_fullRequirements()),
            7 days,
            "https://policy.example/full",
            true,
            false,
            false,
            false
        );
    }

    function testFullPolicyPassesEachRequirementToTheHelper() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _fullRequirements();
        mockHelper.setExpectedMinAge(r.minAge);
        mockHelper.setExpectedNationalitiesIn(r.includedNationalities);
        mockHelper.setExpectedNationalitiesOut(r.excludedNationalities);
        mockHelper.setExpectedFaceMatchMode(FaceMatchMode.STRICT);
        mockHelper.setExpectedSanctionsStrict(true);
        uint256 policyId = _createFullPolicy();

        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
        assertEq(zkPassportCredentials.nullifierWallet(policyId, mockVerifier.nullifier()), wallet);
    }

    function testFullPolicyRejectsEachUnmetRequirement() public {
        uint256 policyId = _createFullPolicy();

        mockHelper.setAgeOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__AgeRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setAgeOk(true);

        mockHelper.setNationalityInOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__NationalityNotIncluded.selector);
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setNationalityInOk(true);

        mockHelper.setNationalityOutOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__ExcludedNationality.selector);
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setNationalityOutOk(true);

        mockHelper.setFaceMatchOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__FaceMatchRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setFaceMatchOk(true);

        mockHelper.setSanctionsOk(false);
        vm.expectRevert("MockVerifierHelper: sanctions root invalid");
        zkPassportCredentials.issue(policyId, _params());
        mockHelper.setSanctionsOk(true);

        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));

        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testNationalityInclusionPredicate() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements();
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

    function testSanctionsModeControlsStrictness() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements();
        r.sanctionsMode = PolicyEvaluatorV1.SanctionsMode.NORMAL;
        uint256 normalPolicy = _createPolicyWith(r, 111);
        r.sanctionsMode = PolicyEvaluatorV1.SanctionsMode.STRICT;
        uint256 strictPolicy = _createPolicyWith(r, 112);

        mockHelper.setExpectedSanctionsStrict(false);
        zkPassportCredentials.issue(normalPolicy, _params());

        mockHelper.setExpectedSanctionsStrict(true);
        zkPassportCredentials.issue(strictPolicy, _params());
    }

    function testNonUniquePolicySkipsNullifierTypeAndDedup() public {
        uint256 policyId = _createPolicyWith(_emptyRequirements(), 113);

        // The proof need not carry the evaluator's uniqueIdentifierType (SALTED)...
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));

        // ...and the nullifier is not consumed, so another wallet with the
        // same document can also hold the credential.
        assertEq(zkPassportCredentials.nullifierWallet(policyId, mockVerifier.nullifier()), address(0));
        address other = makeAddr("other");
        mockHelper.setBoundData(other, block.chainid, "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(other, policyId), 1);
    }

    function testFaceMatchPredicate() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements();
        r.faceMatchMode = FaceMatchMode.STRICT;
        uint256 policyId = _createPolicyWith(r, 110);
        zkPassportCredentials.issue(policyId, _params());

        mockHelper.setFaceMatchOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__FaceMatchRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testRegularFaceMatchPredicate() public {
        // The policy does not enforce uniqueness, so on a salted evaluator a non-salted proof
        // with a REGULAR attestation satisfies it.
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements();
        r.faceMatchMode = FaceMatchMode.REGULAR;
        uint256 policyId = _createPolicyWith(r, 114);
        mockHelper.setExpectedFaceMatchMode(FaceMatchMode.REGULAR);
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);

        mockHelper.setFaceMatchOk(false);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__FaceMatchRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
    }

    function testIssueRevertsWhenSanctionsRootInvalid() public {
        mockHelper.setSanctionsOk(false);
        vm.expectRevert("MockVerifierHelper: sanctions root invalid");
        zkPassportCredentials.issue(strictPolicyId, _params());
    }

    function testLaxPolicySkipsPredicateCalls() public {
        uint256 laxPolicyId = _createDefaultPolicy();
        mockHelper.setAgeOk(false);
        mockHelper.setNationalityInOk(false);
        mockHelper.setNationalityOutOk(false);
        mockHelper.setFaceMatchOk(false);
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
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            7 days,
            "https://policy.example/2",
            true,
            false,
            false,
            false
        );
        address other = makeAddr("other");
        mockHelper.setBoundData(other, block.chainid, "");
        zkPassportCredentials.issue(secondUnique, _params());
        assertEq(zkPassportCredentials.balanceOf(other, secondUnique), 1);
    }

    function testRenounceKeepsNullifierBoundToOriginalWallet() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        vm.prank(wallet);
        zkPassportCredentials.renounce(strictPolicyId);
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

    function testExpiredCredentialKeepsNullifierBoundToOriginalWallet() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        vm.warp(block.timestamp + 7 days + 1);
        mockHelper.setProofTimestamp(block.timestamp);
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 0);

        address mallory = makeAddr("expired");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(strictPolicyId, _params());

        mockHelper.setBoundData(wallet, block.chainid, "");
        zkPassportCredentials.issue(strictPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 1);
    }

    function testSameWalletCanReissueAfterRenounce() public {
        zkPassportCredentials.issue(strictPolicyId, _params());
        vm.prank(wallet);
        zkPassportCredentials.renounce(strictPolicyId);
        zkPassportCredentials.issue(strictPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 1);
    }
}
