// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType, ProofVerificationParams} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";

contract ZKPassportCredentialsNullifierTypeTest is ZKPassportCredentialsTestBase {
    uint256 internal saltedPolicyId;
    uint256 internal nonSaltedPolicyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        saltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(21)), 7 days, NullifierType.SALTED_NULLIFIER, 0, false, noCountries, "https://p.example/s"
        );
        vm.prank(creator);
        nonSaltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(22)),
            7 days,
            NullifierType.NON_SALTED_NULLIFIER,
            0,
            false,
            noCountries,
            "https://p.example/n"
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

    function testCreatePolicyStoresNullifierType() public {
        assertEq(
            uint8(zkPassportCredentials.getPolicy(saltedPolicyId).uniqueIdentifierType),
            uint8(NullifierType.SALTED_NULLIFIER)
        );
        uint256 defaultPolicyId = _createDefaultPolicy();
        assertEq(
            uint8(zkPassportCredentials.getPolicy(defaultPolicyId).uniqueIdentifierType),
            uint8(NullifierType.NONE_NULLIFIER)
        );
    }

    function testSaltedPolicyAcceptsSaltedNullifier() public {
        zkPassportCredentials.issue(wallet, saltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, saltedPolicyId), 1);
    }

    function testSaltedPolicyRejectsNonSaltedNullifier() public {
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WrongNullifierType.selector);
        zkPassportCredentials.issue(
            wallet, saltedPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER)
        );
    }

    function testSaltedPolicyRejectsHiddenNullifier() public {
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WrongNullifierType.selector);
        zkPassportCredentials.issue(wallet, saltedPolicyId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
    }

    function testNonSaltedPolicyAcceptsNonSaltedNullifier() public {
        zkPassportCredentials.issue(
            wallet, nonSaltedPolicyId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER)
        );
        assertEq(zkPassportCredentials.balanceOf(wallet, nonSaltedPolicyId), 1);
    }

    function testNonSaltedPolicyRejectsSaltedNullifier() public {
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__WrongNullifierType.selector);
        zkPassportCredentials.issue(wallet, nonSaltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
    }

    function testUnrestrictedPolicyNeverReadsNullifierType() public {
        uint256 defaultPolicyId = _createDefaultPolicy();
        zkPassportCredentials.issue(wallet, defaultPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, defaultPolicyId), 1);
    }
}
