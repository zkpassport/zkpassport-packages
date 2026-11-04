// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {FaceMatchMode, NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract ZKPassportCredentialsPoliciesTest is ZKPassportCredentialsTestBase {
    function setUp() public {
        _deployZKPassportCredentials(IRootVerifier(makeAddr("verifier")));
    }

    function testCreatePolicyDerivesIdFromOwnerAndSalt() public {
        uint256 policyId = _createDefaultPolicy();
        assertEq(policyId, uint256(keccak256(abi.encode(creator, bytes32(uint256(1))))));
    }

    function testCreatePolicyStoresFields() public {
        string[] memory excluded = new string[](1);
        excluded[0] = "PRK";
        bytes memory requirements = _requirements(18, PolicyEvaluatorV1.SanctionsMode.STRICT, excluded);
        vm.prank(creator);
        uint256 policyId = zkPassportCredentials.createPolicy(
            bytes32(0), requirements, 7 days, "https://policy.example/kyc", true, false, false, false
        );
        ZKPassportCredentials.CredentialsPolicy memory policy = zkPassportCredentials.getPolicy(policyId);
        assertEq(policy.owner, creator);
        assertEq(policy.credentialDuration, 7 days);
        assertTrue(policy.enforceUniqueness);
        assertEq(policy.evaluator, address(evaluator));
        assertEq(policy.requirements, requirements);
        assertEq(policy.metadataURL, "https://policy.example/kyc");

        PolicyEvaluatorV1.PolicyRequirements memory decoded = evaluator.decodeRequirements(policy.requirements);
        assertEq(decoded.minAge, 18);
        assertEq(uint8(decoded.sanctionsMode), uint8(PolicyEvaluatorV1.SanctionsMode.STRICT));
        assertEq(decoded.excludedNationalities.length, 1);
    }

    function testCreatePolicyEmitsEvent() public {
        uint256 expectedId = uint256(keccak256(abi.encode(creator, bytes32(uint256(1)))));
        vm.expectEmit(true, true, false, false);
        emit ZKPassportCredentials.PolicyCreated(expectedId, creator);
        _createDefaultPolicy();
    }

    function testCreatePolicyEmitsStandardURIEvent() public {
        uint256 expectedId = uint256(keccak256(abi.encode(creator, bytes32(uint256(1)))));
        vm.expectEmit(false, true, false, true);
        emit IERC1155.URI("https://policy.example/1", expectedId);
        _createDefaultPolicy();
    }

    function testCreatePolicyRevertsOnDuplicateSalt() public {
        _createDefaultPolicy();
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__PolicyAlreadyExists.selector,
                uint256(keccak256(abi.encode(creator, bytes32(uint256(1)))))
            )
        );
        zkPassportCredentials.createPolicy(
            bytes32(uint256(1)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "other",
            false,
            false,
            false,
            false
        );
    }

    function testSameSaltDifferentOwnersDifferentIds() public {
        uint256 first = _createDefaultPolicy();
        address other = makeAddr("other");
        vm.prank(other);
        uint256 second = zkPassportCredentials.createPolicy(
            bytes32(uint256(1)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "x",
            false,
            false,
            false,
            false
        );
        assertTrue(first != second);
    }

    function testCreatePolicyRevertsOnZeroCredentialDuration() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__InvalidCredentialDuration.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            0,
            "x",
            false,
            false,
            false,
            false
        );
    }

    function testCreatePolicyRejectsDurationAboveMax() public {
        uint64 max = zkPassportCredentials.MAX_CREDENTIAL_DURATION();
        bytes memory requirements = _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries);

        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__InvalidCredentialDuration.selector);
        zkPassportCredentials.createPolicy(bytes32(0), requirements, max + 1, "x", false, false, false, false);

        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__InvalidCredentialDuration.selector);
        zkPassportCredentials.createPolicy(bytes32(0), requirements, type(uint64).max, "x", false, false, false, false);

        vm.prank(creator);
        uint256 policyId =
            zkPassportCredentials.createPolicy(bytes32(0), requirements, max, "x", false, false, false, false);
        assertEq(zkPassportCredentials.getPolicy(policyId).credentialDuration, max);
    }

    function testPolicyKeepsItsCreationEvaluatorAfterSwap() public {
        uint256 policyId = _createDefaultPolicy();
        PolicyEvaluatorV1 newEvaluator =
            new PolicyEvaluatorV1(IRootVerifier(makeAddr("verifier")), true, NullifierType.SALTED_NULLIFIER);
        vm.prank(admin);
        zkPassportCredentials.setPolicyEvaluator(newEvaluator);

        assertEq(zkPassportCredentials.getPolicy(policyId).evaluator, address(evaluator));

        vm.prank(creator);
        uint256 laterPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(2)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "x",
            false,
            false,
            false,
            false
        );
        assertEq(zkPassportCredentials.getPolicy(laterPolicyId).evaluator, address(newEvaluator));
    }

    function testCreatePolicyRejectsOutOfRangeSanctionsMode() public {
        // SanctionsMode has three members; requirement bytes carrying anything above fail the
        // enum decode with an empty revert.
        bytes memory outOfRange = abi.encode(uint8(0), uint8(3), uint8(0), new string[](0), new string[](0));
        vm.prank(creator);
        vm.expectRevert();
        zkPassportCredentials.createPolicy(bytes32(0), outOfRange, 30 days, "x", false, false, false, false);
    }

    function testCreatePolicyValidationIgnoresUniqueness() public {
        // Requirements validation does not see the policy's uniqueness flag, so a salted
        // evaluator accepts REGULAR face match on uniqueness policies too, although a salted
        // proof always commits STRICT and such a policy cannot issue.
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements();
        r.faceMatchMode = FaceMatchMode.REGULAR;
        vm.prank(creator);
        zkPassportCredentials.createPolicy(bytes32(0), abi.encode(r), 30 days, "x", true, false, false, false);
        vm.prank(creator);
        zkPassportCredentials.createPolicy(bytes32(uint256(1)), abi.encode(r), 30 days, "x", false, false, false, false);
    }

    function testCreatePolicyValidatesBothNationalityLists() public {
        string[] memory bad = new string[](1);
        bad[0] = "usa";

        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements();
        r.includedNationalities = bad;
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(bytes32(0), abi.encode(r), 30 days, "x", false, false, false, false);

        r = _emptyRequirements();
        r.excludedNationalities = bad;
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(bytes32(0), abi.encode(r), 30 days, "x", false, false, false, false);
    }

    function testCreatePolicyRejectsMalformedCountryEntries() public {
        string[] memory excluded = new string[](1);

        excluded[0] = "PR";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded),
            30 days,
            "x",
            false,
            false,
            false,
            false
        );

        excluded[0] = "prk";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded),
            30 days,
            "x",
            false,
            false,
            false,
            false
        );

        excluded[0] = "PR ";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded),
            30 days,
            "x",
            false,
            false,
            false,
            false
        );
    }

    function testCreatePolicyRejectsUnsortedOrDuplicateCountries() public {
        string[] memory excluded = new string[](2);

        excluded[0] = "PRK";
        excluded[1] = "IRN";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded),
            30 days,
            "x",
            false,
            false,
            false,
            false
        );

        excluded[0] = "IRN";
        excluded[1] = "IRN";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded),
            30 days,
            "x",
            false,
            false,
            false,
            false
        );

        excluded[0] = "IRN";
        excluded[1] = "PRK";
        vm.prank(creator);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded),
            30 days,
            "x",
            false,
            false,
            false,
            false
        );
    }

    function testCreatePolicyRejectsMalformedRequirements() public {
        vm.prank(creator);
        vm.expectRevert();
        zkPassportCredentials.createPolicy(bytes32(0), hex"deadbeef", 30 days, "x", false, false, false, false);
    }

    function testUriReturnsMetadataURL() public {
        uint256 policyId = _createDefaultPolicy();
        assertEq(zkPassportCredentials.uri(policyId), "https://policy.example/1");
    }

    function testOnlyPolicyOwnerCanSetMetadataURL() public {
        uint256 policyId = _createDefaultPolicy();
        vm.prank(creator);
        zkPassportCredentials.setMetadataURL(policyId, "https://policy.example/updated");
        assertEq(zkPassportCredentials.uri(policyId), "https://policy.example/updated");

        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.setMetadataURL(policyId, "https://evil.example");
    }

    function _createEditablePolicy() internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(uint256(7)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "https://policy.example/editable",
            false,
            false,
            false,
            true
        );
    }

    function testCreatePolicyStoresOwnerEditableFlag() public {
        assertFalse(zkPassportCredentials.getPolicy(_createDefaultPolicy()).ownerEditable);
        assertTrue(zkPassportCredentials.getPolicy(_createEditablePolicy()).ownerEditable);
    }

    function testSetRequirementsReplacesRequirements() public {
        uint256 policyId = _createEditablePolicy();
        bytes memory updated = _requirements(21, PolicyEvaluatorV1.SanctionsMode.STRICT, noCountries);
        vm.prank(creator);
        zkPassportCredentials.setRequirements(policyId, updated);

        assertEq(zkPassportCredentials.getPolicy(policyId).requirements, updated);
        PolicyEvaluatorV1.PolicyRequirements memory decoded =
            evaluator.decodeRequirements(zkPassportCredentials.getPolicy(policyId).requirements);
        assertEq(decoded.minAge, 21);
    }

    function testSetRequirementsEmitsPolicyRequirementsChanged() public {
        uint256 policyId = _createEditablePolicy();
        vm.expectEmit(true, false, false, false);
        emit ZKPassportCredentials.PolicyRequirementsChanged(policyId);
        vm.prank(creator);
        zkPassportCredentials.setRequirements(
            policyId, _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries)
        );
    }

    function testSetRequirementsRevertsWhenNotOwnerEditable() public {
        uint256 policyId = _createDefaultPolicy();
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotEditable.selector);
        zkPassportCredentials.setRequirements(
            policyId, _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries)
        );
    }

    function testOnlyPolicyOwnerCanSetRequirements() public {
        uint256 policyId = _createEditablePolicy();
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.setRequirements(
            policyId, _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries)
        );
    }

    function testSetRequirementsValidatesThroughEvaluator() public {
        uint256 policyId = _createEditablePolicy();
        string[] memory bad = new string[](1);
        bad[0] = "usa";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.setRequirements(policyId, _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, bad));
    }

    function testSetRequirementsAppliesToSubsequentIssuance() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        uint256 policyId = _createEditablePolicy();
        mockHelper.setAgeOk(false);
        zkPassportCredentials.issue(policyId, _params());

        vm.prank(creator);
        zkPassportCredentials.setRequirements(
            policyId, _requirements(18, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries)
        );

        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__AgeRequirementNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());

        mockHelper.setAgeOk(true);
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testSetRequirementsKeepsUniquenessAndBindings() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        uint256 policyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(9)),
            _requirements(0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "https://policy.example/editable-unique",
            true,
            false,
            false,
            true
        );
        zkPassportCredentials.issue(policyId, _params());

        vm.prank(creator);
        zkPassportCredentials.setRequirements(
            policyId, _requirements(18, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries)
        );
        assertTrue(zkPassportCredentials.getPolicy(policyId).enforceUniqueness);

        mockHelper.setBoundData(makeAddr("other"), block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(policyId, _params());

        mockHelper.setBoundData(wallet, block.chainid, "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testSetMetadataURLEmitsStandardURIEvent() public {
        uint256 policyId = _createDefaultPolicy();
        vm.prank(creator);
        vm.expectEmit(false, true, false, true);
        emit IERC1155.URI("https://policy.example/updated", policyId);
        zkPassportCredentials.setMetadataURL(policyId, "https://policy.example/updated");
    }

    function testGetPolicyRevertsWhenUnknown() public {
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyNotFound.selector, uint256(123))
        );
        zkPassportCredentials.getPolicy(123);
    }

    function testPolicyScopeFormat() public {
        uint256 policyId = _createDefaultPolicy();
        assertEq(zkPassportCredentials.policyScope(policyId), Strings.toHexString(policyId, 32));
    }
}
