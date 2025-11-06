// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import "../src/IRegistryInstance.sol";

/**
 * @title MockRegistry
 * @dev Mock registry for testing the delegation functionality
 */
contract MockRegistry is IRegistryInstance {
    bool private shouldReturnValid;

    constructor(bool _shouldReturnValid) {
        shouldReturnValid = _shouldReturnValid;
    }

    function isRootValid(bytes32, uint256) external view returns (bool) {
        return shouldReturnValid;
    }

    function isRootValidAtTimestamp(bytes32, uint256) external view returns (bool) {
        return shouldReturnValid;
    }

    function setShouldReturnValid(bool _shouldReturnValid) external {
        shouldReturnValid = _shouldReturnValid;
    }

    function latestRoot() external pure returns (bytes32) {
        return keccak256("test-root");
    }

    function rootByIndex(uint256) external pure returns (bytes32) {
        return keccak256("test-root");
    }

    function indexByRoot(bytes32) external pure returns (uint256) {
        return 0;
    }

    function rootCount() external pure returns (uint256) {
        return 1;
    }

    function historicalRoots(bytes32)
        external
        pure
        returns (uint256, uint256, bool, uint256, bytes32, bytes32, bytes32, bytes32)
    {
        return (0, 0, false, 0, keccak256("test-root"), bytes32(0), bytes32(0), bytes32(0));
    }

    function rootValidationMode() external pure returns (RootValidationMode) {
        return RootValidationMode.LATEST_ONLY;
    }
}

