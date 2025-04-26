// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IRegistryInstance
 * @dev Interface for a registry instance
 */
interface IRegistryInstance {
    function latestRoot() external view returns (bytes32);
    function historicalRoots(bytes32 root)
        external
        view
        returns (
            uint256 validFrom,
            uint256 validTo,
            bool revoked,
            uint256 leaves,
            bytes32 cid,
            bytes32 metadata1,
            bytes32 metadata2,
            bytes32 metadata3
        );
    function rootCount() external view returns (uint256);
    function rootByIndex(uint256 index) external view returns (bytes32);
    function indexByRoot(bytes32 root) external view returns (uint256);
    function isRootValid(bytes32 root) external view returns (bool);
    function isRootValidAtTimestamp(bytes32 root, uint256 timestamp) external view returns (bool);
}
