// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {PolicyValidationHook} from "../src/PolicyValidationHook.sol";
import {IValidationHook} from "../src/interfaces/IValidationHook.sol";
import {IBaseERC1155ValidationHook, IZKPassportPolicyHook} from "../src/interfaces/IPolicyHookViews.sol";

contract MockBalanceERC1155 {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function setBalance(address account, uint256 id, uint256 value) external {
        balanceOf[account][id] = value;
    }
}

contract PolicyValidationHookTest is Test {
    MockBalanceERC1155 internal token;
    PolicyValidationHook internal hook;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal constant POLICY_ID = 42;

    function setUp() public {
        token = new MockBalanceERC1155();
        hook = new PolicyValidationHook(IERC1155(address(token)), POLICY_ID);
    }

    function testValidatePassesWithCredential() public {
        token.setBalance(alice, POLICY_ID, 1);
        hook.validate(1e18, 100, alice, alice, "");
    }

    function testValidateRevertsWithoutCredential() public {
        vm.expectRevert(abi.encodeWithSelector(PolicyValidationHook.NotOwnerOfERC1155Token.selector, POLICY_ID));
        hook.validate(1e18, 100, alice, alice, "");
    }

    function testValidateRevertsWhenSenderIsNotOwner() public {
        token.setBalance(alice, POLICY_ID, 1);
        vm.expectRevert(PolicyValidationHook.SenderNotOwner.selector);
        hook.validate(1e18, 100, alice, bob, "");
    }

    function testExposesTokenAndPolicyGetters() public view {
        assertEq(address(hook.erc1155()), address(token));
        assertEq(hook.tokenId(), POLICY_ID);
        assertEq(address(hook.attest()), address(token));
        assertEq(hook.policyId(), POLICY_ID);
    }

    function testSupportsExpectedInterfaces() public view {
        assertTrue(hook.supportsInterface(type(IValidationHook).interfaceId));
        assertTrue(hook.supportsInterface(type(IBaseERC1155ValidationHook).interfaceId));
        assertTrue(hook.supportsInterface(type(IZKPassportPolicyHook).interfaceId));
        assertTrue(hook.supportsInterface(type(IERC165).interfaceId));
        assertFalse(hook.supportsInterface(0xffffffff));
    }
}
