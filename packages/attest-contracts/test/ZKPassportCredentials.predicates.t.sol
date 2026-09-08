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
            false,
            _requirements(NullifierType.SALTED_NULLIFIER, 18, PolicyEvaluatorV1.SanctionsMode.STRICT, excluded),
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
        return
            zkPassportCredentials.createPolicy(bytes32(salt), 7 days, false, abi.encode(r), "https://policy.example/x");
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

    function testSanctionsModeControlsStrictness() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.NONE_NULLIFIER);
        r.sanctionsMode = PolicyEvaluatorV1.SanctionsMode.NORMAL;
        uint256 normalPolicy = _createPolicyWith(r, 111);
        r.sanctionsMode = PolicyEvaluatorV1.SanctionsMode.STRICT;
        uint256 strictPolicy = _createPolicyWith(r, 112);

        mockHelper.setExpectedSanctionsStrict(false);
        zkPassportCredentials.issue(normalPolicy, _params());

        mockHelper.setExpectedSanctionsStrict(true);
        zkPassportCredentials.issue(strictPolicy, _params());
    }

    function testConstrainedNullifierTypeWithoutUniquenessSkipsDedup() public {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(NullifierType.SALTED_NULLIFIER);
        r.enforceUniqueness = false;
        uint256 policyId = _createPolicyWith(r, 113);

        // The proof must still carry exactly the required nullifier type...
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));

        // ...but the nullifier is not consumed, so another wallet with the
        // same document can also hold the credential.
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.nullifierWallet(policyId, mockVerifier.nullifier()), address(0));
        address other = makeAddr("other");
        mockHelper.setBoundData(other, block.chainid, "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(other, policyId), 1);
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
            false,
            _requirements(NullifierType.SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
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
