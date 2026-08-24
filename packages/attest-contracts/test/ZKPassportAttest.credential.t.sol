// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Vm} from "forge-std/Vm.sol";

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

    function testGuardianCanRevokeExpiredCredential() public {
        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        vm.prank(guardian);
        attest.revoke(wallet, policyId);
        assertEq(attest.heldUntil(wallet, policyId), 0);
    }

    function testRenewAfterExpiryExtendsWithoutDoubleMint() public {
        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        mockHelper.setProofTimestamp(block.timestamp);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportAttest.CredentialRenewed(wallet, policyId, uint64(block.timestamp + 30 days));
        Vm.Log[] memory logs = new Vm.Log[](0);
        vm.recordLogs();
        attest.issue(wallet, policyId, _params());
        logs = vm.getRecordedLogs();
        // Verify no TransferSingle was emitted (no double mint after expiry)
        bytes32 transferSingleSig = keccak256("TransferSingle(address,address,address,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(attest)) {
                require(logs[i].topics[0] != transferSingleSig, "No TransferSingle should be emitted on renewal");
            }
        }
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
        vm.expectEmit(true, true, true, true);
        emit IERC1155.TransferSingle(address(this), address(0), wallet, policyId, 1);
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }
}
