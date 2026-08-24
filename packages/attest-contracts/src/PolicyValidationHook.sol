// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IValidationHook} from "./interfaces/IValidationHook.sol";
import {IBaseERC1155ValidationHook, IZKPassportPolicyHook} from "./interfaces/IPolicyHookViews.sol";

/**
 * @title  PolicyValidationHook
 * @notice Perpetual Uniswap CCA validation hook gating bids on an attest credential
 */
contract PolicyValidationHook is IValidationHook, IBaseERC1155ValidationHook, IZKPassportPolicyHook, IERC165 {
    error NotOwnerOfERC1155Token(uint256 tokenId);
    error SenderNotOwner();
    error InvalidTokenAddress();

    IERC1155 public immutable erc1155;
    uint256 public immutable tokenId;

    constructor(IERC1155 _erc1155, uint256 _tokenId) {
        if (address(_erc1155) == address(0)) revert InvalidTokenAddress();
        erc1155 = _erc1155;
        tokenId = _tokenId;
    }

    /// @notice Reverts unless the bid owner is the sender and holds a valid credential
    function validate(uint256, uint128, address owner, address sender, bytes calldata) external view {
        if (sender != owner) revert SenderNotOwner();
        if (erc1155.balanceOf(owner, tokenId) == 0) revert NotOwnerOfERC1155Token(tokenId);
    }

    /// @notice The attest registry this hook reads
    function attest() external view returns (IERC1155) {
        return erc1155;
    }

    /// @notice The policy id this hook gates on
    function policyId() external view returns (uint256) {
        return tokenId;
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == type(IValidationHook).interfaceId
            || interfaceId == type(IBaseERC1155ValidationHook).interfaceId
            || interfaceId == type(IZKPassportPolicyHook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
