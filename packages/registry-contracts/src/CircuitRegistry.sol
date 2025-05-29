// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.20;

/**
 * @title CircuitRegistry
 * @dev ZKPassport Circuit Registry
 */
contract CircuitRegistry {
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

    bytes32 public latestRoot;
    mapping(bytes32 => HistoricalRoot) public historicalRoots;
    uint256 public rootCount;
    mapping(uint256 => bytes32) public rootByIndex;
    mapping(bytes32 => uint256) public indexByRoot;

    event RegistryDeployed(address indexed admin, address indexed oracle, uint256 timestamp);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event PausedStatusChanged(bool paused);
    event RootUpdated(bytes32 indexed oldRoot, bytes32 indexed newRoot, uint256 timestamp, uint256 indexed rootIndex);
    event RootRevoked(bytes32 indexed root, uint256 timestamp);
    event RootUnrevoked(bytes32 indexed root, uint256 timestamp);

    /**
     * @dev Constructor
     * @param _oracle The initial oracle address
     */
    constructor(address _admin, address _oracle) {
        require(_admin != address(0), "Admin cannot be zero address");
        require(_oracle != address(0), "Oracle cannot be zero address");
        admin = _admin;
        oracle = _oracle;
        emit RegistryDeployed(admin, oracle, block.timestamp);
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
     * @param leaves The number of leaves in the merkle tree
     * @param cid The IPFS CID of the packaged circuits
     * @param metadata1 Additional metadata (first field)
     * @param metadata2 Additional metadata (second field)
     * @param metadata3 Additional metadata (third field)
     */
    function updateRootWithMetadata(
        bytes32 newRoot,
        uint256 leaves,
        bytes32 cid,
        bytes32 metadata1,
        bytes32 metadata2,
        bytes32 metadata3
    ) public onlyOracle whenNotPaused {
        require(newRoot != bytes32(0), "Root cannot be zero");
        require(indexByRoot[newRoot] == 0, "Root already exists");
        require(leaves > 0, "Leaves count must be greater than zero");

        bytes32 oldRoot = latestRoot;
        uint256 currentTime = block.timestamp;

        // Increment root count and store index mapping
        rootCount++;
        rootByIndex[rootCount] = newRoot;
        indexByRoot[newRoot] = rootCount;

        if (oldRoot != bytes32(0)) {
            // Update the validity period of the previous root
            HistoricalRoot storage oldRootData = historicalRoots[oldRoot];
            oldRootData.validTo = currentTime - 1;
        }

        // Set up the new root's historical data
        historicalRoots[newRoot] = HistoricalRoot({
            validFrom: currentTime,
            validTo: 0, // Special case for latest root
            revoked: false,
            leaves: leaves,
            cid: cid,
            metadata1: metadata1,
            metadata2: metadata2,
            metadata3: metadata3
        });

        latestRoot = newRoot;
        emit RootUpdated(oldRoot, newRoot, currentTime, rootCount);
    }

    /**
     * @dev Update the latest root
     * @param newRoot The new root to set as latest
     * @param leaves The number of leaves in the merkle tree
     * @param cid The IPFS CID of the packaged circuits
     */
    function updateRoot(bytes32 newRoot, uint256 leaves, bytes32 cid) public {
        updateRootWithMetadata(newRoot, leaves, cid, bytes32(0), bytes32(0), bytes32(0));
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
            emit RootUpdated(previousRoot, rootInput.root, rootInput.validFrom, rootCount);

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
     * @dev Check if a root is valid (i.e. is the latest root)
     * @param root The root to check
     * @return valid True if the root is valid
     */
    function isRootValid(bytes32 root) external view returns (bool) {
        // Return false if contract is paused
        if (paused) {
            return false;
        }
        // Return true if the root is the latest root
        if (latestRoot == root) {
            return true;
        }
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

            if (revoked) {
                emit RootRevoked(root, block.timestamp);
            } else {
                emit RootUnrevoked(root, block.timestamp);
            }
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
}
