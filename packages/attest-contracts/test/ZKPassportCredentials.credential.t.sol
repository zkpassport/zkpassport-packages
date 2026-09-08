// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Vm} from "forge-std/Vm.sol";

contract ZKPassportCredentialsCredentialTest is ZKPassportCredentialsTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
        zkPassportCredentials.issue(policyId, _params());
    }

    function testBalanceIsOneUntilHeldUntilInclusive() public {
        vm.warp(uint256(zkPassportCredentials.heldUntil(wallet, policyId)));
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testBalanceIsZeroAfterExpiry() public {
        vm.warp(uint256(zkPassportCredentials.heldUntil(wallet, policyId)) + 1);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 0);
    }

    function testPolicyOwnerCanRevokeExpiredCredential() public {
        vm.warp(uint256(zkPassportCredentials.heldUntil(wallet, policyId)) + 1);
        vm.prank(creator);
        zkPassportCredentials.revoke(wallet, policyId);
        assertEq(zkPassportCredentials.heldUntil(wallet, policyId), 0);
    }

    function testRenewAfterExpiryExtendsWithoutDoubleMint() public {
        vm.warp(uint256(zkPassportCredentials.heldUntil(wallet, policyId)) + 1);
        mockHelper.setProofTimestamp(block.timestamp);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialRenewed(wallet, policyId, uint64(block.timestamp + 30 days), "");
        Vm.Log[] memory logs = new Vm.Log[](0);
        vm.recordLogs();
        zkPassportCredentials.issue(policyId, _params());
        logs = vm.getRecordedLogs();
        // Verify no TransferSingle was emitted (no double mint after expiry)
        bytes32 transferSingleSig = keccak256("TransferSingle(address,address,address,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].emitter == address(zkPassportCredentials)) {
                require(logs[i].topics[0] != transferSingleSig, "No TransferSingle should be emitted on renewal");
            }
        }
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testTransfersRevert() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__TokenIsSoulbound.selector);
        zkPassportCredentials.safeTransferFrom(wallet, makeAddr("receiver"), policyId, 1, "");
    }

    function testBatchTransfersRevert() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = policyId;
        uint256[] memory values = new uint256[](1);
        values[0] = 1;
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__TokenIsSoulbound.selector);
        zkPassportCredentials.safeBatchTransferFrom(wallet, makeAddr("receiver"), ids, values, "");
    }

    function testApprovalsRevert() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__TokenIsSoulbound.selector);
        zkPassportCredentials.setApprovalForAll(makeAddr("operator"), true);
    }

    function testHolderCanRevokeSelf() public {
        vm.prank(wallet);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportCredentials.CredentialRevoked(wallet, policyId, wallet);
        zkPassportCredentials.revoke(wallet, policyId);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 0);
        assertEq(zkPassportCredentials.heldUntil(wallet, policyId), 0);
    }

    function testPolicyOwnerCanRevoke() public {
        vm.prank(creator);
        zkPassportCredentials.revoke(wallet, policyId);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 0);
    }

    function testStrangerCannotRevoke() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotRevocable.selector);
        zkPassportCredentials.revoke(wallet, policyId);
    }

    function testAdminCannotRevoke() public {
        vm.prank(admin);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotRevocable.selector);
        zkPassportCredentials.revoke(wallet, policyId);
    }

    function testRevokeWithoutCredentialReverts() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NothingToRevoke.selector);
        zkPassportCredentials.revoke(stranger, policyId);
    }

    function testReissueAfterRevokeWorks() public {
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, policyId);
        vm.expectEmit(true, true, true, true);
        emit IERC1155.TransferSingle(address(this), address(0), wallet, policyId, 1);
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }
}
