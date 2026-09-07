// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {MockAuction} from "../src/mocks/MockAuction.sol";
import {MockERC1155ValidationHook} from "../src/mocks/MockERC1155ValidationHook.sol";
import {IValidationHook} from "../src/interfaces/IValidationHook.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

contract IntegrationTest is AttestTestBase {
    uint256 internal policyId;
    MockAuction internal auction;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
        MockERC1155ValidationHook hook = new MockERC1155ValidationHook(IERC1155(address(attest)), policyId);
        auction = new MockAuction(hook);
    }

    function testGatedBidRevertsWithoutCredential() public {
        vm.prank(wallet);
        vm.expectRevert(abi.encodeWithSelector(MockERC1155ValidationHook.NotOwnerOfERC1155Token.selector, policyId));
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
        vm.expectRevert(abi.encodeWithSelector(MockERC1155ValidationHook.NotOwnerOfERC1155Token.selector, policyId));
        auction.submitBid(1e18, 100, wallet, "");
    }

    function testBidOnBehalfOfOtherOwnerReverts() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(makeAddr("relayer"));
        vm.expectRevert(MockERC1155ValidationHook.SenderMustBeOwner.selector);
        auction.submitBid(1e18, 100, wallet, "");
    }

    function testUngatedAuctionAcceptsAnyBid() public {
        MockAuction open = new MockAuction(IValidationHook(address(0)));
        vm.prank(wallet);
        open.submitBid(1e18, 100, wallet, "");
        assertEq(open.bidCount(), 1);
    }
}
