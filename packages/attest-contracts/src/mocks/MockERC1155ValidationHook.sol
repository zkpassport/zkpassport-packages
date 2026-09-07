// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IValidationHook} from "../interfaces/IValidationHook.sol";

/**
 * @title  MockERC1155ValidationHook
 * @notice Demo/test stand-in for Uniswap's stock BaseERC1155ValidationHook
 *         (Uniswap/continuous-clearing-auction), replicating its validate
 *         semantics and error names against an ERC-1155 balance
 */
contract MockERC1155ValidationHook is IValidationHook {
    error NotOwnerOfERC1155Token(uint256 tokenId);
    error SenderMustBeOwner();

    IERC1155 public immutable erc1155;
    uint256 public immutable tokenId;

    constructor(IERC1155 _erc1155, uint256 _tokenId) {
        erc1155 = _erc1155;
        tokenId = _tokenId;
    }

    function validate(uint256, uint128, address owner, address sender, bytes calldata) external view {
        if (sender != owner) revert SenderMustBeOwner();
        if (erc1155.balanceOf(owner, tokenId) == 0) revert NotOwnerOfERC1155Token(tokenId);
    }
}
