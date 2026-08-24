// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";

contract ZKPassportAttestCredentialTest is AttestTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
        attest.issue(wallet, policyId, _params());
    }

    function testBalanceIsOneUntilHeldUntilInclusive() public {
        vm.warp(uint256(attest.heldUntil(wallet, policyId)));
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testBalanceIsZeroAfterExpiry() public {
        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        assertEq(attest.balanceOf(wallet, policyId), 0);
    }

    function testRenewAfterExpiryExtendsWithoutDoubleMint() public {
        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        mockHelper.setProofTimestamp(block.timestamp);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportAttest.CredentialRenewed(wallet, policyId, uint64(block.timestamp + 30 days));
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testTransfersRevert() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.Attest__TokenIsSoulbound.selector);
        attest.safeTransferFrom(wallet, makeAddr("receiver"), policyId, 1, "");
    }

    function testBatchTransfersRevert() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = policyId;
        uint256[] memory values = new uint256[](1);
        values[0] = 1;
        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.Attest__TokenIsSoulbound.selector);
        attest.safeBatchTransferFrom(wallet, makeAddr("receiver"), ids, values, "");
    }

    function testApprovalsRevert() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.Attest__TokenIsSoulbound.selector);
        attest.setApprovalForAll(makeAddr("operator"), true);
    }

    function testHolderCanRevokeSelf() public {
        vm.prank(wallet);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportAttest.CredentialRevoked(wallet, policyId, wallet);
        attest.revoke(wallet, policyId);
        assertEq(attest.balanceOf(wallet, policyId), 0);
        assertEq(attest.heldUntil(wallet, policyId), 0);
    }

    function testGuardianCanRevoke() public {
        vm.prank(guardian);
        attest.revoke(wallet, policyId);
        assertEq(attest.balanceOf(wallet, policyId), 0);
    }

    function testPolicyOwnerCannotRevoke() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportAttest.Attest__NotRevocable.selector);
        attest.revoke(wallet, policyId);
    }

    function testRevokeWithoutCredentialReverts() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(ZKPassportAttest.Attest__NothingToRevoke.selector);
        attest.revoke(stranger, policyId);
    }

    function testReissueAfterRevokeWorks() public {
        vm.prank(wallet);
        attest.revoke(wallet, policyId);
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }
}
