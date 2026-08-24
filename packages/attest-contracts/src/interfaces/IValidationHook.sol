// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

/// @notice Uniswap CCA validation hook interface (Uniswap/continuous-clearing-auction).
interface IValidationHook {
    /// @notice Validate a bid; MUST revert if the bid is invalid
    function validate(uint256 maxPrice, uint128 amount, address owner, address sender, bytes calldata hookData) external;
}
