// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType, ProofVerificationParams} from "@registry/lib/Types.sol";
import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";

contract ZKPassportAttestNullifierTypeTest is AttestTestBase {
    uint256 internal saltedUniqueId;
    uint256 internal saltedNonUniqueId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        saltedUniqueId = attest.createPolicy(
            bytes32(uint256(21)), 7 days, true, true, 0, false, noCountries, "https://p.example/su"
        );
        vm.prank(creator);
        saltedNonUniqueId = attest.createPolicy(
            bytes32(uint256(22)), 7 days, false, true, 0, false, noCountries, "https://p.example/sn"
        );
    }

    function _paramsWithNullifierType(NullifierType nullifierType)
        internal
        pure
        returns (ProofVerificationParams memory params)
    {
        params = _params();
        params.proofVerificationData.publicInputs = new bytes32[](3);
        params.proofVerificationData.publicInputs[0] = bytes32(uint256(nullifierType));
    }

    function testCreatePolicyStoresSaltedFlag() public {
        assertTrue(attest.getPolicy(saltedUniqueId).saltedNullifierOnly);
        uint256 defaultPolicyId = _createDefaultPolicy();
        assertFalse(attest.getPolicy(defaultPolicyId).saltedNullifierOnly);
    }

    function testSaltedUniqueAcceptsSaltedNullifier() public {
        attest.issue(wallet, saltedUniqueId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(attest.balanceOf(wallet, saltedUniqueId), 1);
    }

    function testSaltedUniqueRejectsNonSaltedNullifier() public {
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__SaltedNullifierRequired.selector);
        attest.issue(wallet, saltedUniqueId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
    }

    function testSaltedUniqueRejectsHiddenNullifier() public {
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__SaltedNullifierRequired.selector);
        attest.issue(wallet, saltedUniqueId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
    }

    function testSaltedNonUniqueAcceptsHiddenNullifier() public {
        attest.issue(wallet, saltedNonUniqueId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
        assertEq(attest.balanceOf(wallet, saltedNonUniqueId), 1);
    }

    function testSaltedNonUniqueAcceptsSaltedNullifier() public {
        attest.issue(wallet, saltedNonUniqueId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(attest.balanceOf(wallet, saltedNonUniqueId), 1);
    }

    function testSaltedNonUniqueRejectsNonSaltedNullifier() public {
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__SaltedNullifierRequired.selector);
        attest.issue(wallet, saltedNonUniqueId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
    }

    function testUnrestrictedPolicyAcceptsEveryRealNullifierType() public {
        uint256 defaultPolicyId = _createDefaultPolicy();
        attest.issue(wallet, defaultPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER));
        attest.issue(wallet, defaultPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        attest.issue(wallet, defaultPolicyId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
        assertEq(attest.balanceOf(wallet, defaultPolicyId), 1);
    }

    function testUnrestrictedPolicyRejectsMockNullifierTypes() public {
        uint256 defaultPolicyId = _createDefaultPolicy();
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__MockProofNotAllowed.selector);
        attest.issue(wallet, defaultPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER));
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__MockProofNotAllowed.selector);
        attest.issue(wallet, defaultPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
    }

    function testSaltedUniqueRejectsMockSaltedNullifier() public {
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__MockProofNotAllowed.selector);
        attest.issue(wallet, saltedUniqueId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
    }
}
