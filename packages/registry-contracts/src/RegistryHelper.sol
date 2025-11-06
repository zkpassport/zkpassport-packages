// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.20;

import "./IRegistryInstance.sol";
import "./RootRegistry.sol";

/**
 * @title RegistryHelper
 * @dev Helper contract for getting historical roots from registries using pagination
 */
contract RegistryHelper {
    RootRegistry public immutable rootRegistry;

    /**
     * @dev Constructor to set the root registry address
     * @param _rootRegistry The root registry address to use for all operations
     */
    constructor(RootRegistry _rootRegistry) {
        require(address(_rootRegistry) != address(0), "Root registry address cannot be zero");
        rootRegistry = _rootRegistry;
    }

    struct RootDetails {
        uint256 index;
        bytes32 root;
        uint256 validFrom;
        uint256 validTo;
        bool revoked;
        uint256 leaves;
        bytes32 cid;
    }

    /**
     * @dev Get historical roots with pagination
     * @param registryId The registry identifier
     * @param startIndex The index to start from (first index is 1)
     * @param limit Maximum number of roots to return per page
     * @return roots Array of root details for this page
     * @return isLastPage Boolean indicating if this is the last page
     */
    function getHistoricalRoots(bytes32 registryId, uint256 startIndex, uint256 limit)
        external
        view
        returns (RootDetails[] memory roots, bool isLastPage)
    {
        require(registryId != bytes32(0), "Registry identifier cannot be zero");
        require(startIndex > 0, "Start index must be > 0");
        require(limit > 0, "Limit must be > 0");

        IRegistryInstance registry = IRegistryInstance(rootRegistry.registries(registryId));

        uint256 totalRoots = registry.rootCount();
        // If no roots exist yet
        if (totalRoots == 0) {
            return (new RootDetails[](0), true);
        }

        // Determine start index (default to 1 if passed 0)
        uint256 currentIndex = startIndex;

        // Verify the start index is valid
        require(currentIndex <= totalRoots, "Start index out of bounds");

        // Calculate how many roots we can actually retrieve
        uint256 maxRoots = totalRoots - currentIndex + 1;
        uint256 actualLimit = maxRoots < limit ? maxRoots : limit;

        // Initialize results array with the actual size
        roots = new RootDetails[](actualLimit);
        isLastPage = (currentIndex + actualLimit > totalRoots);

        // Populate the results array
        for (uint256 i = 0; i < actualLimit; i++) {
            bytes32 rootHash = registry.rootByIndex(currentIndex);

            // Get the root details - accessing all fields from the consolidated HistoricalRoot struct
            (uint256 validFrom, uint256 validTo, bool revoked, uint256 leaves, bytes32 cid,,,) =
                registry.historicalRoots(rootHash);

            // Add to results
            roots[i] = RootDetails({
                index: currentIndex,
                root: rootHash,
                validFrom: validFrom,
                validTo: validTo,
                revoked: revoked,
                leaves: leaves,
                cid: cid
            });

            // Move to the next index
            currentIndex++;
        }

        return (roots, isLastPage);
    }

    /**
     * @dev Get historical roots with pagination using root hash
     * @param registryId The registry identifier
     * @param fromRoot The root to start from (bytes32(0) to start from earliest root)
     * @param limit Maximum number of roots to return per page
     * @return roots Array of root details for this page
     * @return isLastPage Boolean indicating if this is the last page
     */
    function getHistoricalRootsByHash(bytes32 registryId, bytes32 fromRoot, uint256 limit)
        external
        view
        returns (RootDetails[] memory roots, bool isLastPage)
    {
        require(registryId != bytes32(0), "Registry identifier cannot be zero");
        require(limit > 0, "Limit must be > 0");

        IRegistryInstance registry = IRegistryInstance(rootRegistry.registries(registryId));

        uint256 startIndex;
        // If fromRoot is zero, start from index 1
        if (fromRoot == bytes32(0)) {
            startIndex = 1;
        } else {
            // Verify that the fromRoot exists
            startIndex = registry.indexByRoot(fromRoot);
            require(startIndex != 0, "Starting root not found");
            // Start from the next root
            startIndex++;
        }
        return this.getHistoricalRoots(registryId, startIndex, limit);
    }

    /**
     * @dev Get the latest root details
     * @param registryId The registry identifier
     * @return The details of the latest root
     */
    function getLatestRootDetails(bytes32 registryId) external view returns (RootDetails memory) {
        require(registryId != bytes32(0), "Registry identifier cannot be zero");

        IRegistryInstance registry = IRegistryInstance(rootRegistry.registries(registryId));
        bytes32 latestRoot = registry.latestRoot();
        require(latestRoot != bytes32(0), "No roots exist yet");

        // Get the consolidated data from historicalRoots
        (uint256 validFrom, uint256 validTo, bool revoked, uint256 leaves, bytes32 cid,,,) =
            registry.historicalRoots(latestRoot);

        // Get the index of the latest root
        uint256 index = registry.indexByRoot(latestRoot);

        return RootDetails({
            index: index,
            root: latestRoot,
            validFrom: validFrom,
            validTo: validTo,
            revoked: revoked,
            leaves: leaves,
            cid: cid
        });
    }

    /**
     * @dev Get the root details of a root by index
     * @param registryId The registry identifier
     * @param index The index of the root
     * @return The details of the root
     */
    function getRootDetailsByIndex(bytes32 registryId, uint256 index) external view returns (RootDetails memory) {
        require(registryId != bytes32(0), "Registry identifier cannot be zero");

        IRegistryInstance registry = IRegistryInstance(rootRegistry.registries(registryId));
        bytes32 root = registry.rootByIndex(index);
        require(root != bytes32(0), "Root not found");

        // Get the consolidated data from historicalRoots
        (uint256 validFrom, uint256 validTo, bool revoked, uint256 leaves, bytes32 cid,,,) =
            registry.historicalRoots(root);

        return RootDetails({
            index: index,
            root: root,
            validFrom: validFrom,
            validTo: validTo,
            revoked: revoked,
            leaves: leaves,
            cid: cid
        });
    }

    /**
     * @dev Get the root details of a root by root hash
     * @param registryId The registry identifier
     * @param root The root hash
     * @return The details of the root
     */
    function getRootDetailsByRoot(bytes32 registryId, bytes32 root) external view returns (RootDetails memory) {
        require(registryId != bytes32(0), "Registry identifier cannot be zero");
        require(root != bytes32(0), "Root hash cannot be zero");

        IRegistryInstance registry = IRegistryInstance(rootRegistry.registries(registryId));
        uint256 index = registry.indexByRoot(root);
        require(index != 0, "Root not found");

        // Get the consolidated data from historicalRoots
        (uint256 validFrom, uint256 validTo, bool revoked, uint256 leaves, bytes32 cid,,,) =
            registry.historicalRoots(root);

        return RootDetails({
            index: index,
            root: root,
            validFrom: validFrom,
            validTo: validTo,
            revoked: revoked,
            leaves: leaves,
            cid: cid
        });
    }

    /**
     * @dev Get the total number of historical roots
     * @param registryId The registry identifier
     * @return count The total number of roots
     */
    function totalHistoricalRoots(bytes32 registryId) external view returns (uint256) {
        require(registryId != bytes32(0), "Registry identifier cannot be zero");
        IRegistryInstance registry = IRegistryInstance(rootRegistry.registries(registryId));
        return registry.rootCount();
    }

    /**
     * @dev Check if a root is valid at a given timestamp for a specific registry
     * @param registryId The registry identifier
     * @param root The root to check
     * @param timestamp The timestamp to check validity for
     * @return valid True if the root is valid at the given timestamp, false otherwise.
     */
    function isRootValidAtTimestamp(bytes32 registryId, bytes32 root, uint256 timestamp) external view returns (bool) {
        // Return false if root registry is paused
        if (rootRegistry.paused()) return false;

        // Return false if registry with this identifier doesn't exist
        if (address(rootRegistry.registries(registryId)) == address(0)) return false;

        // Call isRootValidAtTimestamp on registry instance
        try IRegistryInstance(rootRegistry.registries(registryId)).isRootValidAtTimestamp(root, timestamp) returns (
            bool valid
        ) {
            return valid;
        } catch {
            return false;
        }
    }
}
