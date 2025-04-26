// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IRegistryInstance.sol";

/**
 * @title RootRegistry
 * @dev ZKPassport Root Registry
 */
contract RootRegistry {
    address public admin;
    bool public paused;

    // Registry mapping: registry identifier => registry contract address
    mapping(bytes32 => address) public registries;

    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event PausedStatusChanged(bool paused);
    event RegistryUpdated(bytes32 indexed registry, address indexed oldAddress, address indexed newAddress);
    event RootRegistryDeployed(address indexed admin, uint256 timestamp);

    /**
     * @dev Constructor
     */
    constructor(address _admin) {
        require(_admin != address(0), "Admin cannot be zero address");
        admin = _admin;
        emit RootRegistryDeployed(admin, block.timestamp);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized: admin only");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    /**
     * @dev Update a registry contract address
     * @param registry The registry identifier
     * @param registryAddress The new registry contract address
     */
    function updateRegistry(bytes32 registry, address registryAddress) external onlyAdmin whenNotPaused {
        address oldAddress = registries[registry];
        registries[registry] = registryAddress;
        emit RegistryUpdated(registry, oldAddress, registryAddress);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Admin cannot be zero address");
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminUpdated(oldAdmin, newAdmin);
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit PausedStatusChanged(_paused);
    }

    /**
     * @dev Check if a root is valid for a specific registry
     * @param registryId The registry identifier
     * @param root The root to check
     * @return valid True if the root is valid
     */
    function isRootValid(bytes32 registryId, bytes32 root) external view returns (bool) {
        // Return false if contract is paused
        if (paused) return false;

        // Return false if registry with this identifier doesn't exist
        if (registries[registryId] == address(0)) return false;

        // Call isRootValid on registry instance
        try IRegistryInstance(registries[registryId]).isRootValid(root) returns (bool valid) {
            return valid;
        } catch {
            return false;
        }
    }

    /**
     * @dev Get the latest root for a specific registry
     * @param registryId The registry identifier
     * @return root The latest root, or bytes32(0) if registry doesn't exist or call fails
     */
    function latestRoot(bytes32 registryId) external view returns (bytes32) {
        // Return bytes32(0) if contract is paused
        if (paused) return bytes32(0);

        // Return bytes32(0) if registry with this identifier doesn't exist
        if (registries[registryId] == address(0)) return bytes32(0);

        // Call latestRoot on registry instance
        try IRegistryInstance(registries[registryId]).latestRoot() returns (bytes32 root) {
            return root;
        } catch {
            return bytes32(0);
        }
    }

    /**
     * @dev Check if a root is valid at a given timestamp for a specific registry
     * @param registryId The registry identifier
     * @param root The root to check
     * @param timestamp The timestamp to check validity for
     * @return valid True if the root is valid at the given timestamp
     */
    function isRootValidAtTimestamp(bytes32 registryId, bytes32 root, uint256 timestamp) external view returns (bool) {
        // Return false if contract is paused
        if (paused) return false;

        // Return false if registry with this identifier doesn't exist
        if (registries[registryId] == address(0)) return false;

        // Call isRootValidAtTimestamp on registry instance
        try IRegistryInstance(registries[registryId]).isRootValidAtTimestamp(root, timestamp) returns (bool valid) {
            return valid;
        } catch {
            return false;
        }
    }
}
