// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

import {IRegistryInstance} from "./IRegistryInstance.sol";

/**
 * @title RootRegistry
 * @dev ZKPassport Root Registry
 */
contract RootRegistry {
    address public admin;
    address public guardian;
    bool public paused;

    // Registry mapping: registry identifier => registry contract address
    mapping(bytes32 registryId => IRegistryInstance instance) public registries;

    // Counter for the number of active registries
    uint256 public registryCount;

    // Config mapping: config key => config value
    mapping(bytes32 key => bytes32 value) public config;

    // Events
    event RootRegistryDeployed(address indexed admin, address indexed guardian);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event RegistryAdded(bytes32 indexed registryId, address indexed registryAddress);
    event RegistryUpdated(bytes32 indexed registryId, address indexed oldAddress, address indexed newAddress);
    event RegistryRemoved(bytes32 indexed registryId, address indexed registryAddress);
    event PausedStatusChanged(bool paused);
    event ConfigUpdated(bytes32 indexed key, bytes32 oldValue, bytes32 newValue);

    /**
     * @dev Constructor
     */
    constructor(address _admin, address _guardian) {
        require(_admin != address(0), "Admin cannot be zero address");
        admin = _admin;
        guardian = _guardian;
        emit RootRegistryDeployed(admin, guardian);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized: admin only");
        _;
    }

    modifier onlyAdminOrGuardian() {
        require(msg.sender == admin || msg.sender == guardian, "Not authorized: admin or guardian only");
        _;
    }

    /**
     * @dev Add a new registry
     * @param registryId The registry identifier
     * @param registryAddress The registry address
     */
    function addRegistry(bytes32 registryId, IRegistryInstance registryAddress) external onlyAdmin {
        require(address(registryAddress) != address(0), "Registry address cannot be zero address");
        require(address(registries[registryId]) == address(0), "Registry already exists");
        registryCount++;
        registries[registryId] = registryAddress;
        emit RegistryAdded(registryId, address(registryAddress));
    }

    /**
     * @dev Update an existing registry
     * @param registryId The registry identifier
     * @param newAddress The new registry address
     */
    function updateRegistry(bytes32 registryId, IRegistryInstance newAddress) external onlyAdmin {
        require(address(newAddress) != address(0), "Registry address cannot be zero address");
        IRegistryInstance oldAddress = registries[registryId];
        require(address(oldAddress) != address(0), "Registry does not exist");
        registries[registryId] = newAddress;
        emit RegistryUpdated(registryId, address(oldAddress), address(newAddress));
    }

    /**
     * @dev Remove an existing registry
     * @param registryId The registry identifier
     */
    function removeRegistry(bytes32 registryId) external onlyAdmin {
        IRegistryInstance registryAddress = registries[registryId];
        require(address(registryAddress) != address(0), "Registry does not exist");
        registryCount--;
        delete registries[registryId];
        emit RegistryRemoved(registryId, address(registryAddress));
    }

    /**
     * @dev Transfer the admin role to a new address
     * @param newAdmin The new admin address
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Admin cannot be zero address");
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminUpdated(oldAdmin, newAdmin);
    }

    /**
     * @dev Set the guardian address
     * @param newGuardian The new guardian address
     */
    function setGuardian(address newGuardian) external onlyAdmin {
        address oldGuardian = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(oldGuardian, newGuardian);
    }

    /**
     * @dev Update a config value
     * @param key The config key
     * @param value The config value
     */
    function updateConfig(bytes32 key, bytes32 value) external onlyAdmin {
        bytes32 oldValue = config[key];
        config[key] = value;
        emit ConfigUpdated(key, oldValue, value);
    }

    /**
     * @dev Pause the root registry
     * @notice Only admin or guardian can pause the root registry
     */
    function pause() external onlyAdminOrGuardian {
        paused = true;
        emit PausedStatusChanged(true);
    }

    /**
     * @dev Unpause the root registry
     * @notice Only admin can unpause the root registry
     */
    function unpause() external onlyAdmin {
        paused = false;
        emit PausedStatusChanged(false);
    }

    /**
     * @dev Get the latest root of a specific registry
     * @param registryId The registry identifier
     * @return root The latest root, or bytes32(0) if registry doesn't exist or call fails
     */
    function latestRoot(bytes32 registryId) external view returns (bytes32) {
        // Return bytes32(0) if registry with this identifier doesn't exist
        if (address(registries[registryId]) == address(0)) return bytes32(0);

        // Return the latest root from the registry instance
        try IRegistryInstance(registries[registryId]).latestRoot() returns (bytes32 root) {
            return root;
        } catch {
            return bytes32(0);
        }
    }

    /**
     * @dev Check if a root is valid for a specific registry
     * @param registryId The registry identifier
     * @param root The root to check
     * @param timestamp The timestamp to check validity for (how this is validated depends on the registry's validation mode)
     * @return valid True if the root is valid
     */
    function isRootValid(bytes32 registryId, bytes32 root, uint256 timestamp) external view returns (bool) {
        // Return false if contract is paused
        if (paused) return false;

        // Return false if registry with this identifier doesn't exist
        if (address(registries[registryId]) == address(0)) return false;

        // Call isRootValid on registry instance
        try IRegistryInstance(registries[registryId]).isRootValid(root, timestamp) returns (bool valid) {
            return valid;
        } catch {
            return false;
        }
    }
}
