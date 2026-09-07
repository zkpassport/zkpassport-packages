// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";

contract ZKPassportCredentialsPoliciesTest is AttestTestBase {
    function setUp() public {
        _deployAttest(IRootVerifier(makeAddr("verifier")));
    }

    function testCreatePolicyDerivesIdFromOwnerAndSalt() public {
        uint256 policyId = _createDefaultPolicy();
        assertEq(policyId, uint256(keccak256(abi.encode(creator, bytes32(uint256(1))))));
    }

    function testCreatePolicyStoresFields() public {
        string[] memory excluded = new string[](1);
        excluded[0] = "PRK";
        vm.prank(creator);
        uint256 policyId =
            attest.createPolicy(bytes32(0), 7 days, true, false, 18, true, excluded, "https://policy.example/kyc");
        ZKPassportCredentials.Policy memory policy = attest.getPolicy(policyId);
        assertEq(policy.owner, creator);
        assertEq(policy.validityPeriod, 7 days);
        assertTrue(policy.unique);
        assertEq(policy.minAge, 18);
        assertTrue(policy.sanctionsCheck);
        assertEq(policy.excludedCountries.length, 1);
        assertEq(policy.metadataURL, "https://policy.example/kyc");
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
        attest.createPolicy(bytes32(uint256(1)), 30 days, false, false, 0, false, noCountries, "other");
    }

    function testSameSaltDifferentOwnersDifferentIds() public {
        uint256 first = _createDefaultPolicy();
        address other = makeAddr("other");
        vm.prank(other);
        uint256 second = attest.createPolicy(bytes32(uint256(1)), 30 days, false, false, 0, false, noCountries, "x");
        assertTrue(first != second);
    }

    function testCreatePolicyRevertsOnZeroValidityPeriod() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__InvalidValidityPeriod.selector);
        attest.createPolicy(bytes32(0), 0, false, false, 0, false, noCountries, "x");
    }

    function testUriReturnsMetadataURL() public {
        uint256 policyId = _createDefaultPolicy();
        assertEq(attest.uri(policyId), "https://policy.example/1");
    }

    function testOnlyPolicyOwnerCanSetMetadataURL() public {
        uint256 policyId = _createDefaultPolicy();
        vm.prank(creator);
        attest.setMetadataURL(policyId, "https://policy.example/updated");
        assertEq(attest.uri(policyId), "https://policy.example/updated");

        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        attest.setMetadataURL(policyId, "https://evil.example");
    }

    function testGetPolicyRevertsWhenUnknown() public {
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyNotFound.selector, uint256(123))
        );
        attest.getPolicy(123);
    }

    function testPolicyScopeFormat() public {
        uint256 policyId = _createDefaultPolicy();
        string memory scope = attest.policyScope(policyId);
        assertEq(bytes(scope).length, 7 + 66);
    }
}
