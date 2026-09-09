// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {FaceMatchMode} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";

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
        bytes memory requirements = _requirements(
            PolicyEvaluatorV1.PolicyNullifierType.SALTED_NULLIFIER, 18, PolicyEvaluatorV1.SanctionsMode.STRICT, excluded
        );
        vm.prank(creator);
        uint256 policyId = zkPassportCredentials.createPolicy(
            bytes32(0), requirements, 7 days, "https://policy.example/kyc", false, false
        );
        ZKPassportCredentials.Policy memory policy = zkPassportCredentials.getPolicy(policyId);
        assertEq(policy.owner, creator);
        assertEq(policy.credentialDuration, 7 days);
        assertEq(policy.evaluator, address(evaluator));
        assertEq(policy.requirements, requirements);
        assertEq(policy.metadataURL, "https://policy.example/kyc");

        PolicyEvaluatorV1.PolicyRequirements memory decoded = evaluator.decodeRequirements(policy.requirements);
        assertEq(uint8(decoded.uniqueIdentifierType), uint8(PolicyEvaluatorV1.PolicyNullifierType.SALTED_NULLIFIER));
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
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER,
                0,
                PolicyEvaluatorV1.SanctionsMode.NONE,
                noCountries
            ),
            30 days,
            "other",
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
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER,
                0,
                PolicyEvaluatorV1.SanctionsMode.NONE,
                noCountries
            ),
            30 days,
            "x",
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
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER,
                0,
                PolicyEvaluatorV1.SanctionsMode.NONE,
                noCountries
            ),
            0,
            "x",
            false,
            false
        );
    }

    function testPolicyKeepsItsCreationEvaluatorAfterSwap() public {
        uint256 policyId = _createDefaultPolicy();
        PolicyEvaluatorV1 newEvaluator = new PolicyEvaluatorV1(mockVerifier);
        vm.prank(admin);
        zkPassportCredentials.setPolicyEvaluator(newEvaluator);

        assertEq(zkPassportCredentials.getPolicy(policyId).evaluator, address(evaluator));

        vm.prank(creator);
        uint256 laterPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(2)),
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER,
                0,
                PolicyEvaluatorV1.SanctionsMode.NONE,
                noCountries
            ),
            30 days,
            "x",
            false,
            false
        );
        assertEq(zkPassportCredentials.getPolicy(laterPolicyId).evaluator, address(newEvaluator));
    }

    function testCreatePolicyRejectsOutOfRangePolicyNullifierTypes() public {
        // PolicyNullifierType has three members, so the proof side's mock values (and anything
        // else out of range) cannot be expressed: such requirement bytes fail the enum decode
        // with an empty revert.
        bytes memory outOfRange =
            abi.encode(uint8(3), false, uint8(0), uint8(0), uint8(0), new string[](0), new string[](0));
        vm.prank(creator);
        vm.expectRevert();
        zkPassportCredentials.createPolicy(bytes32(0), outOfRange, 30 days, "x", false, false);
    }

    function testCreatePolicyRejectsRegularFaceMatchWithSaltedNullifier() public {
        PolicyEvaluatorV1.PolicyRequirements memory r =
            _emptyRequirements(PolicyEvaluatorV1.PolicyNullifierType.SALTED_NULLIFIER);
        r.faceMatchMode = FaceMatchMode.REGULAR;
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__SaltedNullifierRequiresStrictFaceMatch.selector);
        zkPassportCredentials.createPolicy(bytes32(0), abi.encode(r), 30 days, "x", false, false);

        r.faceMatchMode = FaceMatchMode.STRICT;
        vm.prank(creator);
        zkPassportCredentials.createPolicy(bytes32(0), abi.encode(r), 30 days, "x", false, false);
    }

    function testCreatePolicyRejectsUniquenessWithoutNullifierType() public {
        PolicyEvaluatorV1.PolicyRequirements memory r =
            _emptyRequirements(PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER);
        r.enforceUniqueness = true;
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__UniquenessRequiresNullifierType.selector);
        zkPassportCredentials.createPolicy(bytes32(0), abi.encode(r), 30 days, "x", false, false);
    }

    function testCreatePolicyValidatesBothNationalityLists() public {
        string[] memory bad = new string[](1);
        bad[0] = "usa";

        PolicyEvaluatorV1.PolicyRequirements memory r =
            _emptyRequirements(PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER);
        r.includedNationalities = bad;
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(bytes32(0), abi.encode(r), 30 days, "x", false, false);

        r = _emptyRequirements(PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER);
        r.excludedNationalities = bad;
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(bytes32(0), abi.encode(r), 30 days, "x", false, false);
    }

    function testCreatePolicyRejectsMalformedCountryEntries() public {
        string[] memory excluded = new string[](1);

        excluded[0] = "PR";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded
            ),
            30 days,
            "x",
            false,
            false
        );

        excluded[0] = "prk";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded
            ),
            30 days,
            "x",
            false,
            false
        );

        excluded[0] = "PR ";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded
            ),
            30 days,
            "x",
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
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded
            ),
            30 days,
            "x",
            false,
            false
        );

        excluded[0] = "IRN";
        excluded[1] = "IRN";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded
            ),
            30 days,
            "x",
            false,
            false
        );

        excluded[0] = "IRN";
        excluded[1] = "PRK";
        vm.prank(creator);
        zkPassportCredentials.createPolicy(
            bytes32(0),
            _requirements(
                PolicyEvaluatorV1.PolicyNullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, excluded
            ),
            30 days,
            "x",
            false,
            false
        );
    }

    function testCreatePolicyRejectsMalformedRequirements() public {
        vm.prank(creator);
        vm.expectRevert();
        zkPassportCredentials.createPolicy(bytes32(0), hex"deadbeef", 30 days, "x", false, false);
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

    function testGetPolicyRevertsWhenUnknown() public {
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyNotFound.selector, uint256(123))
        );
        zkPassportCredentials.getPolicy(123);
    }

    function testPolicyScopeFormat() public {
        uint256 policyId = _createDefaultPolicy();
        string memory scope = zkPassportCredentials.policyScope(policyId);
        assertEq(bytes(scope).length, 7 + 66);
    }
}
