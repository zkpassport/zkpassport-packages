// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

interface IRootRegistryAdmin {
    function transferAdmin(address newAdmin) external;
    function setGuardian(address newGuardian) external;
    function addRegistry(bytes32 registryId, address registryAddress) external;
    function updateRegistry(bytes32 registryId, address newAddress) external;
    function removeRegistry(bytes32 registryId) external;
    function updateConfig(bytes32 key, bytes32 value) external;
    function pause() external;
    function unpause() external;
}

interface IRootVerifierAdmin {
    function transferAdmin(address newAdmin) external;
    function setGuardian(address newGuardian) external;
    function addSubVerifier(bytes32 version, address subVerifier) external;
    function removeSubVerifier(bytes32 version) external;
    function updateSubVerifier(bytes32 version, address newSubVerifier) external;
    function addHelper(bytes32 version, address newHelper) external;
    function removeHelper(bytes32 version) external;
    function updateHelper(bytes32 version, address newHelper) external;
    function updateConfig(bytes32 key, bytes32 value) external;
    function pause() external;
    function unpause() external;
}

/**
 * @title ProtocolController
 * @dev Manages operator roles for ZKPassport RootVerifier and RootRegistry contracts.
 *      The admin can reassign operator roles and transfer admin on the underlying
 *      contracts back to itself. Operators can call the respective admin functions
 *      on the underlying contracts through this controller.
 */
contract ProtocolController {
    address public admin;
    address public pendingAdmin;
    address public rootRegistryOperator;
    address public rootVerifierOperator;

    IRootRegistryAdmin public rootRegistry;
    IRootVerifierAdmin public rootVerifier;

    event AdminTransferStarted(address indexed currentAdmin, address indexed pendingAdmin);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);
    event RootRegistryOperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event RootVerifierOperatorUpdated(address indexed oldOperator, address indexed newOperator);

    constructor(
        address _admin,
        address _rootRegistry,
        address _rootRegistryOperator,
        address _rootVerifier,
        address _rootVerifierOperator
    ) {
        require(_admin != address(0), "Admin cannot be zero address");
        admin = _admin;
        rootRegistry = IRootRegistryAdmin(_rootRegistry);
        rootRegistryOperator = _rootRegistryOperator;
        rootVerifier = IRootVerifierAdmin(_rootVerifier);
        rootVerifierOperator = _rootVerifierOperator;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized: admin only");
        _;
    }

    modifier onlyAdminOrRootRegistryOperator() {
        require(
            msg.sender == admin || msg.sender == rootRegistryOperator,
            "Not authorized: admin or root registry operator only"
        );
        _;
    }

    modifier onlyAdminOrRootVerifierOperator() {
        require(
            msg.sender == admin || msg.sender == rootVerifierOperator,
            "Not authorized: admin or root verifier operator only"
        );
        _;
    }

    // ===== Admin functions =====

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Admin cannot be zero address");
        pendingAdmin = newAdmin;
        emit AdminTransferStarted(admin, newAdmin);
    }

    function acceptAdmin() external {
        require(msg.sender == pendingAdmin, "Not authorized: pending admin only");
        address oldAdmin = admin;
        admin = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferred(oldAdmin, msg.sender);
    }

    function setRootRegistryOperator(address newOperator) external onlyAdmin {
        address oldOperator = rootRegistryOperator;
        rootRegistryOperator = newOperator;
        emit RootRegistryOperatorUpdated(oldOperator, newOperator);
    }

    function setRootVerifierOperator(address newOperator) external onlyAdmin {
        address oldOperator = rootVerifierOperator;
        rootVerifierOperator = newOperator;
        emit RootVerifierOperatorUpdated(oldOperator, newOperator);
    }

    /// @notice Restores admin of the RootRegistry contract from this controller back to the admin.
    function restoreRootRegistryAdmin() external onlyAdmin {
        rootRegistry.transferAdmin(admin);
    }

    /// @notice Restores admin of the RootVerifier contract from this controller back to the admin.
    function restoreRootVerifierAdmin() external onlyAdmin {
        rootVerifier.transferAdmin(admin);
    }

    // ===== Root Registry Operator functions =====

    function rootRegistry_addRegistry(bytes32 registryId, address registryAddress)
        external
        onlyAdminOrRootRegistryOperator
    {
        rootRegistry.addRegistry(registryId, registryAddress);
    }

    function rootRegistry_updateRegistry(bytes32 registryId, address newAddress)
        external
        onlyAdminOrRootRegistryOperator
    {
        rootRegistry.updateRegistry(registryId, newAddress);
    }

    function rootRegistry_removeRegistry(bytes32 registryId) external onlyAdminOrRootRegistryOperator {
        rootRegistry.removeRegistry(registryId);
    }

    function rootRegistry_setGuardian(address newGuardian) external onlyAdminOrRootRegistryOperator {
        rootRegistry.setGuardian(newGuardian);
    }

    function rootRegistry_updateConfig(bytes32 key, bytes32 value) external onlyAdminOrRootRegistryOperator {
        rootRegistry.updateConfig(key, value);
    }

    function rootRegistry_pause() external onlyAdminOrRootRegistryOperator {
        rootRegistry.pause();
    }

    function rootRegistry_unpause() external onlyAdminOrRootRegistryOperator {
        rootRegistry.unpause();
    }

    // ===== Root Verifier Operator functions =====

    function rootVerifier_addSubVerifier(bytes32 version, address subVerifier)
        external
        onlyAdminOrRootVerifierOperator
    {
        rootVerifier.addSubVerifier(version, subVerifier);
    }

    function rootVerifier_removeSubVerifier(bytes32 version) external onlyAdminOrRootVerifierOperator {
        rootVerifier.removeSubVerifier(version);
    }

    function rootVerifier_updateSubVerifier(bytes32 version, address newSubVerifier)
        external
        onlyAdminOrRootVerifierOperator
    {
        rootVerifier.updateSubVerifier(version, newSubVerifier);
    }

    function rootVerifier_addHelper(bytes32 version, address newHelper) external onlyAdminOrRootVerifierOperator {
        rootVerifier.addHelper(version, newHelper);
    }

    function rootVerifier_removeHelper(bytes32 version) external onlyAdminOrRootVerifierOperator {
        rootVerifier.removeHelper(version);
    }

    function rootVerifier_updateHelper(bytes32 version, address newHelper) external onlyAdminOrRootVerifierOperator {
        rootVerifier.updateHelper(version, newHelper);
    }

    function rootVerifier_setGuardian(address newGuardian) external onlyAdminOrRootVerifierOperator {
        rootVerifier.setGuardian(newGuardian);
    }

    function rootVerifier_updateConfig(bytes32 key, bytes32 value) external onlyAdminOrRootVerifierOperator {
        rootVerifier.updateConfig(key, value);
    }

    function rootVerifier_pause() external onlyAdminOrRootVerifierOperator {
        rootVerifier.pause();
    }

    function rootVerifier_unpause() external onlyAdminOrRootVerifierOperator {
        rootVerifier.unpause();
    }
}
