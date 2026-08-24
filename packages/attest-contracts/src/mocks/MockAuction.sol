// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IValidationHook} from "../interfaces/IValidationHook.sol";

/**
 * @title  MockAuction
 * @notice Demo/test stand-in for a CCA auction: calls the validation hook with
 *         _submitBid's semantics before accepting a bid
 */
contract MockAuction {
    event BidAccepted(address indexed owner, address indexed sender, uint256 maxPrice, uint128 amount);

    IValidationHook public immutable validationHook;
    uint256 public bidCount;

    constructor(IValidationHook _validationHook) {
        validationHook = _validationHook;
    }

    function submitBid(uint256 maxPrice, uint128 amount, address owner, bytes calldata hookData) external {
        if (address(validationHook) != address(0)) {
            validationHook.validate(maxPrice, amount, owner, msg.sender, hookData);
        }
        bidCount++;
        emit BidAccepted(owner, msg.sender, maxPrice, amount);
    }
}
