// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {MockAuction} from "../src/mocks/MockAuction.sol";
import {PolicyValidationHook} from "../src/PolicyValidationHook.sol";
import {IValidationHook} from "../src/interfaces/IValidationHook.sol";

contract IntegrationTest is AttestTestBase {
    uint256 internal policyId;
    MockAuction internal auction;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
        auction = new MockAuction(IValidationHook(attest.getPolicy(policyId).hook));
    }

    function testGatedBidRevertsWithoutCredential() public {
        vm.prank(wallet);
        vm.expectRevert(abi.encodeWithSelector(PolicyValidationHook.NotOwnerOfERC1155Token.selector, policyId));
        auction.submitBid(1e18, 100, wallet, "");
    }

    function testBidPassesAfterCredentialMint() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(wallet);
        auction.submitBid(1e18, 100, wallet, "");
        assertEq(auction.bidCount(), 1);
    }

    function testBidRevertsAgainAfterExpiry() public {
        attest.issue(wallet, policyId, _params());
        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        vm.prank(wallet);
        vm.expectRevert(abi.encodeWithSelector(PolicyValidationHook.NotOwnerOfERC1155Token.selector, policyId));
        auction.submitBid(1e18, 100, wallet, "");
    }

    function testBidOnBehalfOfOtherOwnerReverts() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(makeAddr("relayer"));
        vm.expectRevert(PolicyValidationHook.SenderNotOwner.selector);
        auction.submitBid(1e18, 100, wallet, "");
    }

    function testUngatedAuctionAcceptsAnyBid() public {
        MockAuction open = new MockAuction(IValidationHook(address(0)));
        vm.prank(wallet);
        open.submitBid(1e18, 100, wallet, "");
        assertEq(open.bidCount(), 1);
    }
}
