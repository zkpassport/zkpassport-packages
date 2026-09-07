// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType, ProofVerificationParams} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";

contract ZKPassportCredentialsNullifierTypeTest is ZKPassportCredentialsTestBase {
    uint256 internal saltedUniqueId;
    uint256 internal saltedNonUniqueId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        vm.prank(creator);
        saltedUniqueId = zkPassportCredentials.createPolicy(
            bytes32(uint256(21)), 7 days, true, true, 0, false, noCountries, "https://p.example/su"
        );
        vm.prank(creator);
        saltedNonUniqueId = zkPassportCredentials.createPolicy(
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
        assertTrue(zkPassportCredentials.getPolicy(saltedUniqueId).saltedNullifierOnly);
        uint256 defaultPolicyId = _createDefaultPolicy();
        assertFalse(zkPassportCredentials.getPolicy(defaultPolicyId).saltedNullifierOnly);
    }

    function testSaltedUniqueAcceptsSaltedNullifier() public {
        zkPassportCredentials.issue(wallet, saltedUniqueId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, saltedUniqueId), 1);
    }

    function testSaltedUniqueRejectsNonSaltedNullifier() public {
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__SaltedNullifierRequired.selector);
        zkPassportCredentials.issue(
            wallet, saltedUniqueId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER)
        );
    }

    function testSaltedUniqueRejectsHiddenNullifier() public {
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__SaltedNullifierRequired.selector);
        zkPassportCredentials.issue(wallet, saltedUniqueId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
    }

    function testSaltedNonUniqueAcceptsHiddenNullifier() public {
        zkPassportCredentials.issue(wallet, saltedNonUniqueId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, saltedNonUniqueId), 1);
    }

    function testSaltedNonUniqueAcceptsSaltedNullifier() public {
        zkPassportCredentials.issue(wallet, saltedNonUniqueId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, saltedNonUniqueId), 1);
    }

    function testSaltedNonUniqueRejectsNonSaltedNullifier() public {
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__SaltedNullifierRequired.selector);
        zkPassportCredentials.issue(
            wallet, saltedNonUniqueId, _paramsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER)
        );
    }

    function testUnrestrictedPolicyNeverReadsNullifierType() public {
        uint256 defaultPolicyId = _createDefaultPolicy();
        zkPassportCredentials.issue(wallet, defaultPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, defaultPolicyId), 1);
    }
}
