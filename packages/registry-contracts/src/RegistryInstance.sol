// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.20;

import "./IRegistryInstance.sol";

/**
 * @title RegistryInstance
 * @dev ZKPassport Registry Instance
 */
contract RegistryInstance is IRegistryInstance {
    struct HistoricalRoot {
        uint256 validFrom;
        uint256 validTo;
        bool revoked;
        uint256 leaves;
        bytes32 cid;
        bytes32 metadata1;
        bytes32 metadata2;
        bytes32 metadata3;
    }

    struct RootInput {
        bytes32 root;
        uint256 validFrom;
        uint256 validTo;
        bool revoked;
        uint256 leaves;
        bytes32 cid;
        bytes32 metadata1;
        bytes32 metadata2;
        bytes32 metadata3;
    }

    address public admin;
    address public oracle;
    bool public paused;

    uint256 public rootCount;
    uint256 public treeHeight;
    bytes32 public latestRoot;
    RootValidationMode public rootValidationMode;
    uint256 public validityWindowSecs;

    mapping(bytes32 => HistoricalRoot) public historicalRoots;
    mapping(uint256 => bytes32) public rootByIndex;
    mapping(bytes32 => uint256) public indexByRoot;
    mapping(bytes32 => bytes32) public config;

    // Events
    event RegistryDeployed(
        address indexed admin,
        address indexed oracle,
        uint256 treeHeight,
        RootValidationMode rootValidationMode,
        uint256 validityWindowSecs
    );
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event RootUpdated(
        bytes32 indexed oldRoot, bytes32 indexed newRoot, uint256 indexed rootIndex, uint256 validFrom, uint256 leaves
    );
    event RootRevocationStatusChanged(bytes32 indexed root, bool revoked);
    event RootValidationModeChanged(RootValidationMode indexed oldMode, RootValidationMode indexed newMode);
    event ValidityWindowChanged(uint256 oldWindowSecs, uint256 newWindowSecs);
    event PausedStatusChanged(bool paused);

    /**
     * @dev Constructor
     * @param _admin The initial admin address
     * @param _oracle The initial oracle address
     * @param _treeHeight The Merkle tree height
     * @param _rootValidationMode The initial root validation mode
     * @param _validityWindowSecs The initial validity window in seconds
     */
    constructor(
        address _admin,
        address _oracle,
        uint256 _treeHeight,
        RootValidationMode _rootValidationMode,
        uint256 _validityWindowSecs
    ) {
        require(_admin != address(0), "Admin cannot be zero address");
        require(_oracle != address(0), "Oracle cannot be zero address");
        admin = _admin;
        oracle = _oracle;
        treeHeight = _treeHeight;
        rootValidationMode = _rootValidationMode;
        validityWindowSecs = _validityWindowSecs;
        emit RegistryDeployed(admin, oracle, treeHeight, rootValidationMode, validityWindowSecs);
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized: admin only");
        _;
    }

    modifier onlyOracle() {
        require(msg.sender == oracle, "Not authorized: oracle only");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    /**
     * @dev Update the latest root with metadata
     * @param newRoot The new root to set as latest
     * @param currentRoot The expected current root (must match latestRoot, or bytes32(0) for first update)
     * @param timestamp The timestamp of the root update
     * @param leaves The number of leaves in the merkle tree for this root
     * @param cid The IPFS CIDv0 of the file packaging the content for this root
     * @param metadata1 Additional metadata 1 (optional)
     * @param metadata2 Additional metadata 2 (optional)
     * @param metadata3 Additional metadata 3 (optional)
     */
    function updateRootWithMetadata(
        bytes32 newRoot,
        bytes32 currentRoot,
        uint256 timestamp,
        uint256 leaves,
        bytes32 cid,
        bytes32 metadata1,
        bytes32 metadata2,
        bytes32 metadata3
    ) public onlyOracle whenNotPaused {
        require(newRoot != bytes32(0), "Root cannot be zero");
        require(indexByRoot[newRoot] == 0, "Root already exists");
        require(leaves > 0, "Leaves count must be greater than zero");
        require(currentRoot == latestRoot, "Current root mismatch");

        bytes32 oldRoot = latestRoot;

        // Increment root count and store index mapping
        rootCount++;
        rootByIndex[rootCount] = newRoot;
        indexByRoot[newRoot] = rootCount;

        if (oldRoot != bytes32(0)) {
            HistoricalRoot storage oldRootData = historicalRoots[oldRoot];
            // Ensure timestamp is after previous root's validFrom
            require(timestamp > oldRootData.validFrom, "Timestamp must be after previous root validFrom");
            // Update the validity period of the previous root
            oldRootData.validTo = timestamp - 1;
        }

        // Set up the new root's historical data
        historicalRoots[newRoot] = HistoricalRoot({
            validFrom: timestamp,
            validTo: 0, // Special case for latest root
            revoked: false,
            leaves: leaves,
            cid: cid,
            metadata1: metadata1,
            metadata2: metadata2,
            metadata3: metadata3
        });

        latestRoot = newRoot;
        emit RootUpdated(oldRoot, newRoot, rootCount, timestamp, leaves);
    }

    /**
     * @dev Update the latest root (using explicit timestamp and current root check safeguard)
     * @param newRoot The new root to set as latest
     * @param currentRoot The expected current root (must match latestRoot, or bytes32(0) for first update)
     * @param timestamp The timestamp of the root update used for validity
     * @param leaves The number of leaves in the merkle tree
     * @param cid The IPFS CIDv0 of the file packaging the content for this root specific to this registry
     */
    function updateRoot(bytes32 newRoot, bytes32 currentRoot, uint256 timestamp, uint256 leaves, bytes32 cid) public {
        updateRootWithMetadata(newRoot, currentRoot, timestamp, leaves, cid, bytes32(0), bytes32(0), bytes32(0));
    }

    /**
     * @dev Batch update roots
     * @param roots Array of root data
     */
    function batchUpdateRoots(RootInput[] calldata roots) external onlyOracle whenNotPaused {
        require(roots.length > 0, "Empty roots array");

        bytes32 previousRoot = latestRoot;

        for (uint256 i = 0; i < roots.length; i++) {
            RootInput calldata rootInput = roots[i];

            require(rootInput.root != bytes32(0), "Root cannot be zero");
            require(indexByRoot[rootInput.root] == 0, "Root already exists");
            require(rootInput.leaves > 0, "Leaves count must be greater than zero");

            // Validate chronological ordering
            // For first root, ensure it comes after current latest root (if exists)
            if (i == 0) {
                if (latestRoot != bytes32(0)) {
                    require(
                        rootInput.validFrom > historicalRoots[latestRoot].validFrom,
                        "First root validFrom must be after current latest root"
                    );
                }
            }
            // For subsequent roots, ensure validFrom is after previous root's validTo
            else {
                require(
                    rootInput.validFrom > roots[i - 1].validTo, "Root validFrom must be after previous root validTo"
                );
            }
            // Ensure validTo is non-zero unless it's the last root
            if (i < roots.length - 1) {
                require(rootInput.validTo != 0, "Root validTo cannot be zero unless it's the last root");
                require(rootInput.validTo >= rootInput.validFrom, "Root validTo must be >= validFrom");
            }

            // Increment root count and store index mapping
            rootCount++;
            rootByIndex[rootCount] = rootInput.root;
            indexByRoot[rootInput.root] = rootCount;

            // Set up this root's historical data
            historicalRoots[rootInput.root] = HistoricalRoot({
                validFrom: rootInput.validFrom,
                validTo: rootInput.validTo,
                revoked: rootInput.revoked,
                leaves: rootInput.leaves,
                cid: rootInput.cid,
                metadata1: rootInput.metadata1,
                metadata2: rootInput.metadata2,
                metadata3: rootInput.metadata3
            });

            // Emit event for this root with proper oldRoot sequencing
            emit RootUpdated(previousRoot, rootInput.root, rootCount, rootInput.validFrom, rootInput.leaves);

            // Update previous root for the next iteration
            previousRoot = rootInput.root;
        }

        // The last root in the array becomes the latest root
        bytes32 newLatestRoot = roots[roots.length - 1].root;

        // If we already had a latest root, update its validTo
        if (latestRoot != bytes32(0)) {
            HistoricalRoot storage oldLatestRoot = historicalRoots[latestRoot];
            oldLatestRoot.validTo = historicalRoots[newLatestRoot].validFrom - 1;
        }

        // Set the latest root to the last one in the array
        latestRoot = newLatestRoot;
    }

    /**
     * @dev Check if a root is valid
     * @param root The root to check
     * @param timestamp The timestamp to check validity for (used in VALID_AT_TIMESTAMP and VALID_WITHIN_WINDOW modes)
     * @return valid True if the root is valid
     */
    function isRootValid(bytes32 root, uint256 timestamp) external view returns (bool) {
        // Return false if contract is paused
        if (paused) return false;
        // Return false if root doesn't exist
        if (indexByRoot[root] == 0) return false; // Root doesn't exist

        // LATEST_ONLY mode: check if root is the latest root
        if (rootValidationMode == RootValidationMode.LATEST_ONLY) {
            // Return true if root is the latest root and is not revoked
            return latestRoot == root && !historicalRoots[root].revoked;
        }
        // LATEST_AND_PREVIOUS mode: check if root is either the latest or previous root
        else if (rootValidationMode == RootValidationMode.LATEST_AND_PREVIOUS) {
            // Return true if root is the latest root and is not revoked
            if (latestRoot == root) return !historicalRoots[root].revoked;
            // Return true if root is the previous root (if it exists) and is not revoked
            if (rootCount >= 2) {
                return rootByIndex[rootCount - 1] == root && !historicalRoots[root].revoked;
            }
            return false;
        }
        // VALID_AT_TIMESTAMP mode: check if root was valid at the given timestamp
        else if (rootValidationMode == RootValidationMode.VALID_AT_TIMESTAMP) {
            HistoricalRoot memory rootData = historicalRoots[root];
            // Return true if root was valid at the given timestamp and is not revoked
            return timestamp >= rootData.validFrom && (rootData.validTo == 0 || timestamp <= rootData.validTo)
                && !rootData.revoked;
        }
        // VALID_WITHIN_WINDOW mode: check if root was valid within the last X seconds
        else if (rootValidationMode == RootValidationMode.VALID_WITHIN_WINDOW) {
            // Return true if root is the latest root and is not revoked
            if (latestRoot == root) return !historicalRoots[root].revoked;
            // For other roots, check if they were valid within the validity window
            HistoricalRoot memory rootData = historicalRoots[root];
            // Return false if revoked
            if (rootData.revoked) return false;
            // Check if root's validity period overlaps with [timestamp - validityWindowSecs, timestamp]
            uint256 windowStart = timestamp - validityWindowSecs;
            return rootData.validFrom <= timestamp && (rootData.validTo == 0 || rootData.validTo >= windowStart);
        }
        // Unknown mode: return false
        return false;
    }

    /**
     * @dev Check if a root is valid at a given timestamp
     * @param root The root to check
     * @param timestamp The timestamp to check validity for
     * @return valid True if the root is valid at the given timestamp
     */
    function isRootValidAtTimestamp(bytes32 root, uint256 timestamp) external view returns (bool) {
        // Return false if contract is paused
        if (paused) {
            return false;
        }

        // Check if root exists
        if (indexByRoot[root] == 0) {
            return false; // Root doesn't exist
        }

        HistoricalRoot memory rootData = historicalRoots[root];

        // Check validity period
        bool withinValidPeriod =
            timestamp >= rootData.validFrom && (rootData.validTo == 0 || timestamp <= rootData.validTo);

        return !rootData.revoked && withinValidPeriod;
    }

    /**
     * @dev Set the revocation status of a root
     * @param root The root to update
     * @param revoked The new revocation status
     */
    function setRevocationStatus(bytes32 root, bool revoked) external onlyOracle whenNotPaused {
        require(root != bytes32(0), "Root cannot be zero");
        require(indexByRoot[root] != 0, "Root does not exist");

        // Only emit event if status is changing
        if (historicalRoots[root].revoked != revoked) {
            historicalRoots[root].revoked = revoked;
            emit RootRevocationStatusChanged(root, revoked);
        }
    }

    /**
     * @dev Set the oracle address
     * @param newOracle The new oracle address
     */
    function setOracle(address newOracle) external onlyAdmin {
        require(newOracle != address(0), "Oracle cannot be zero address");
        address oldOracle = oracle;
        oracle = newOracle;
        emit OracleUpdated(oldOracle, newOracle);
    }

    /**
     * @dev Transfer admin role to a new address
     * @param newAdmin The address that will receive admin privileges
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Admin cannot be zero address");
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminUpdated(oldAdmin, newAdmin);
    }

    /**
     * @dev Set the paused state of the contract
     * @param _paused True to pause the contract, false to unpause
     */
    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit PausedStatusChanged(_paused);
    }

    /**
     * @dev Set the root validation mode
     * @param newMode The new validation mode
     */
    function setRootValidationMode(RootValidationMode newMode) external onlyAdmin {
        RootValidationMode oldMode = rootValidationMode;
        rootValidationMode = newMode;
        emit RootValidationModeChanged(oldMode, newMode);
    }

    /**
     * @dev Set the validity window for VALID_WITHIN_WINDOW validation mode
     * @param newWindowSecs The new window in seconds
     */
    function setValidityWindow(uint256 newWindowSecs) external onlyAdmin {
        uint256 oldWindowSecs = validityWindowSecs;
        validityWindowSecs = newWindowSecs;
        emit ValidityWindowChanged(oldWindowSecs, newWindowSecs);
    }
}
