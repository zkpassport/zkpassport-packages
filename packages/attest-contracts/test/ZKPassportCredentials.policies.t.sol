// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
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
        bytes memory requirements = _requirements(NullifierType.SALTED_NULLIFIER, 18, true, excluded);
        vm.prank(creator);
        uint256 policyId =
            zkPassportCredentials.createPolicy(bytes32(0), 7 days, requirements, "https://policy.example/kyc");
        ZKPassportCredentials.Policy memory policy = zkPassportCredentials.getPolicy(policyId);
        assertEq(policy.owner, creator);
        assertEq(policy.credentialDuration, 7 days);
        assertEq(policy.evaluator, address(evaluator));
        assertEq(policy.requirements, requirements);
        assertEq(policy.metadataURL, "https://policy.example/kyc");

        PolicyEvaluatorV1.PolicyRequirements memory decoded = evaluator.decodeRequirements(policy.requirements);
        assertEq(uint8(decoded.uniqueIdentifierType), uint8(NullifierType.SALTED_NULLIFIER));
        assertEq(decoded.minAge, 18);
        assertTrue(decoded.sanctionsCheck);
        assertEq(decoded.excludedCountries.length, 1);
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
            bytes32(uint256(1)), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, noCountries), "other"
        );
    }

    function testSameSaltDifferentOwnersDifferentIds() public {
        uint256 first = _createDefaultPolicy();
        address other = makeAddr("other");
        vm.prank(other);
        uint256 second = zkPassportCredentials.createPolicy(
            bytes32(uint256(1)), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, noCountries), "x"
        );
        assertTrue(first != second);
    }

    function testCreatePolicyRevertsOnZeroCredentialDuration() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__InvalidCredentialDuration.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0), 0, _requirements(NullifierType.NONE_NULLIFIER, 0, false, noCountries), "x"
        );
    }

    function testPolicyKeepsItsCreationEvaluatorAfterSwap() public {
        uint256 policyId = _createDefaultPolicy();
        PolicyEvaluatorV1 newEvaluator = new PolicyEvaluatorV1();
        vm.prank(admin);
        zkPassportCredentials.setPolicyEvaluator(newEvaluator);

        assertEq(zkPassportCredentials.getPolicy(policyId).evaluator, address(evaluator));

        vm.prank(creator);
        uint256 laterPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(2)), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, noCountries), "x"
        );
        assertEq(zkPassportCredentials.getPolicy(laterPolicyId).evaluator, address(newEvaluator));
    }

    function testCreatePolicyRejectsMockNullifierTypes() public {
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidNullifierType.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0), 30 days, _requirements(NullifierType.NON_SALTED_MOCK_NULLIFIER, 0, false, noCountries), "x"
        );

        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidNullifierType.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0), 30 days, _requirements(NullifierType.SALTED_MOCK_NULLIFIER, 0, false, noCountries), "x"
        );
    }

    function testCreatePolicyRejectsMalformedCountryEntries() public {
        string[] memory excluded = new string[](1);

        excluded[0] = "PR";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, excluded), "x"
        );

        excluded[0] = "prk";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, excluded), "x"
        );

        excluded[0] = "PR ";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, excluded), "x"
        );
    }

    function testCreatePolicyRejectsUnsortedOrDuplicateCountries() public {
        string[] memory excluded = new string[](2);

        excluded[0] = "PRK";
        excluded[1] = "IRN";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, excluded), "x"
        );

        excluded[0] = "IRN";
        excluded[1] = "IRN";
        vm.prank(creator);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidCountryList.selector);
        zkPassportCredentials.createPolicy(
            bytes32(0), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, excluded), "x"
        );

        excluded[0] = "IRN";
        excluded[1] = "PRK";
        vm.prank(creator);
        zkPassportCredentials.createPolicy(
            bytes32(0), 30 days, _requirements(NullifierType.NONE_NULLIFIER, 0, false, excluded), "x"
        );
    }

    function testCreatePolicyRejectsMalformedRequirements() public {
        vm.prank(creator);
        vm.expectRevert();
        zkPassportCredentials.createPolicy(bytes32(0), 30 days, hex"deadbeef", "x");
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
