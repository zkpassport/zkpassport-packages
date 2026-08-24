// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @notice Getter shape of Uniswap's stock BaseERC1155ValidationHook, for backend introspection.
interface IBaseERC1155ValidationHook {
    function erc1155() external view returns (IERC1155);
    function tokenId() external view returns (uint256);
}

/// @notice ZKPassport-specific introspection: resolves the attest registry and policy id.
interface IZKPassportPolicyHook {
    function attest() external view returns (IERC1155);
    function policyId() external view returns (uint256);
}
