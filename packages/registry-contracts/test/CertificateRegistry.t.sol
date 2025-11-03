pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/CertificateRegistry.sol";
import "../src/IRegistryInstance.sol";

contract CertificateRegistryTest is Test {
    CertificateRegistry public registry;
    address public admin = address(1);
    address public user = address(2);
    address public oracle = address(3);
    address public newOracle = address(4);
    bytes32 public testRoot1 = keccak256("test-root-1");
    bytes32 public testRoot2 = keccak256("test-root-2");
    bytes32 public testRoot3 = keccak256("test-root-3");
    bytes32 public testIpfsCid1 = keccak256("ipfs-cid-1");
    bytes32 public testIpfsCid2 = keccak256("ipfs-cid-2");
    bytes32 public testIpfsCid3 = keccak256("ipfs-cid-3");
    bytes32 public testMetadata1 = keccak256("metadata-1");
    bytes32 public testMetadata2 = keccak256("metadata-2");
    bytes32 public testMetadata3 = keccak256("metadata-3");

    function setUp() public {
        vm.prank(admin);
        registry = new CertificateRegistry(admin, oracle);
    }

    function testDeploymentEvent() public {
        // Deploy a new registry to capture the event
        vm.recordLogs();
        vm.prank(admin);
        new CertificateRegistry(admin, oracle);

        // Get the logs
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // Find the RegistryDeployed event
        bool found = false;
        for (uint256 i = 0; i < entries.length; i++) {
            // The event signature is the first topic
            if (entries[i].topics[0] == keccak256("RegistryDeployed(address,address,uint256)")) {
                // The admin address is the second topic (indexed parameter)
                assertEq(address(uint160(uint256(entries[i].topics[1]))), admin);
                // The oracle address is the third topic (indexed parameter)
                assertEq(address(uint160(uint256(entries[i].topics[2]))), oracle);
                found = true;
                break;
            }
        }

        assertTrue(found, "RegistryDeployed event not emitted");
    }

    function testConstructorSetsOracle() public view {
        assertEq(registry.oracle(), oracle);
    }

    function testCannotDeployWithZeroAdmin() public {
        vm.prank(admin);
        vm.expectRevert("Admin cannot be zero address");
        new CertificateRegistry(address(0), oracle);
    }

    function testCannotDeployWithZeroOracle() public {
        vm.prank(admin);
        vm.expectRevert("Oracle cannot be zero address");
        new CertificateRegistry(admin, address(0));
    }

    function testUpdateRoot() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);
        assertEq(registry.latestRoot(), testRoot1);
        assertEq(registry.rootCount(), 1);
        assertEq(registry.rootByIndex(1), testRoot1);
        assertEq(registry.indexByRoot(testRoot1), 1);

        // Check historical root data
        (
            uint256 validFrom,
            uint256 validTo,
            bool revoked,
            uint256 leaves,
            bytes32 cid,
            bytes32 metadata1,
            bytes32 metadata2,
            bytes32 metadata3
        ) = registry.historicalRoots(testRoot1);

        assertEq(validFrom, block.timestamp);
        assertEq(validTo, 0); // Special case for latest root
        assertFalse(revoked);
        assertEq(cid, testIpfsCid1);
        assertEq(leaves, 100);
        assertEq(metadata1, bytes32(0));
        assertEq(metadata2, bytes32(0));
        assertEq(metadata3, bytes32(0));

        // Update to a new root
        uint256 timestamp1 = block.timestamp;
        vm.warp(timestamp1 + 100);

        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);
        assertEq(registry.latestRoot(), testRoot2);
        assertEq(registry.rootCount(), 2);
        assertEq(registry.rootByIndex(2), testRoot2);
        assertEq(registry.indexByRoot(testRoot2), 2);

        // Check that old root is now historical
        (validFrom, validTo, revoked, leaves, cid,,,) = registry.historicalRoots(testRoot1);
        assertEq(validTo, block.timestamp - 1);
        assertEq(cid, testIpfsCid1);
        assertEq(leaves, 100);

        // Check new root data
        (validFrom, validTo, revoked, leaves, cid,,,) = registry.historicalRoots(testRoot2);
        assertEq(validFrom, block.timestamp);
        assertEq(validTo, 0); // Special case for latest root
        assertFalse(revoked);
        assertEq(cid, testIpfsCid2);
        assertEq(leaves, 200);
    }

    function testUpdateRootWithMetadata() public {
        // Set a root with specific metadata
        vm.prank(oracle);
        registry.updateRootWithMetadata(testRoot1, 100, testIpfsCid1, testMetadata1, testMetadata2, testMetadata3);

        // Verify the root was set correctly
        assertEq(registry.latestRoot(), testRoot1);
        assertEq(registry.rootCount(), 1);
        assertEq(registry.rootByIndex(1), testRoot1);
        assertEq(registry.indexByRoot(testRoot1), 1);

        // Check that metadata was correctly stored
        (
            uint256 validFrom,
            uint256 validTo,
            bool revoked,
            uint256 leaves,
            bytes32 cid,
            bytes32 metadata1,
            bytes32 metadata2,
            bytes32 metadata3
        ) = registry.historicalRoots(testRoot1);

        assertEq(validFrom, block.timestamp);
        assertEq(validTo, 0);
        assertFalse(revoked);
        assertEq(leaves, 100);
        assertEq(cid, testIpfsCid1);
        assertEq(metadata1, testMetadata1);
        assertEq(metadata2, testMetadata2);
        assertEq(metadata3, testMetadata3);
    }

    function testUpdateRootWithMetadataHistoricalRoots() public {
        // First root with metadata
        vm.prank(oracle);
        registry.updateRootWithMetadata(testRoot1, 100, testIpfsCid1, testMetadata1, testMetadata2, testMetadata3);

        uint256 timestamp1 = block.timestamp;
        vm.warp(timestamp1 + 100);

        // Second root with different metadata
        vm.prank(oracle);
        registry.updateRootWithMetadata(
            testRoot2, 200, testIpfsCid2, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3))
        );

        // Verify first root becomes historical with proper validTo
        (
            uint256 validFrom,
            uint256 validTo,
            bool revoked,
            uint256 leaves,
            bytes32 cid,
            bytes32 metadata1,
            bytes32 metadata2,
            bytes32 metadata3
        ) = registry.historicalRoots(testRoot1);

        assertEq(validFrom, timestamp1);
        assertEq(validTo, block.timestamp - 1);
        assertFalse(revoked);
        assertEq(leaves, 100);
        assertEq(cid, testIpfsCid1);
        assertEq(metadata1, testMetadata1);
        assertEq(metadata2, testMetadata2);
        assertEq(metadata3, testMetadata3);
    }

    function testUpdateRootWithMetadataMultipleRoots() public {
        // First root
        vm.prank(oracle);
        registry.updateRootWithMetadata(testRoot1, 100, testIpfsCid1, testMetadata1, testMetadata2, testMetadata3);

        vm.warp(block.timestamp + 100);

        // Second root
        vm.prank(oracle);
        registry.updateRootWithMetadata(
            testRoot2, 200, testIpfsCid2, bytes32(uint256(1)), bytes32(uint256(2)), bytes32(uint256(3))
        );

        vm.warp(block.timestamp + 100);

        // Third root with zero metadata
        vm.prank(oracle);
        registry.updateRootWithMetadata(testRoot3, 300, testIpfsCid3, bytes32(0), bytes32(0), bytes32(0));

        // Verify third root is now latest
        assertEq(registry.latestRoot(), testRoot3);
        assertEq(registry.rootCount(), 3);
        assertEq(registry.rootByIndex(3), testRoot3);
        assertEq(registry.indexByRoot(testRoot3), 3);

        // Verify second root now has validTo set
        (, uint256 validTo,,,,,,) = registry.historicalRoots(testRoot2);

        assertEq(validTo, block.timestamp - 1);

        // Verify third root details
        (
            uint256 validFrom,
            uint256 root3ValidTo,
            bool revoked,
            uint256 leaves,
            bytes32 cid,
            bytes32 metadata1,
            bytes32 metadata2,
            bytes32 metadata3
        ) = registry.historicalRoots(testRoot3);

        assertEq(validFrom, block.timestamp);
        assertEq(root3ValidTo, 0);
        assertFalse(revoked);
        assertEq(leaves, 300);
        assertEq(cid, testIpfsCid3);
        assertEq(metadata1, bytes32(0));
        assertEq(metadata2, bytes32(0));
        assertEq(metadata3, bytes32(0));
    }

    function testOracleCanUpdateRoot() public {
        // Oracle updates the root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);
        assertEq(registry.latestRoot(), testRoot1);

        // Oracle updates to a new root
        uint256 timestamp1 = block.timestamp;
        vm.warp(timestamp1 + 100);

        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);
        assertEq(registry.latestRoot(), testRoot2);
    }

    function testAdminCannotUpdateRoot() public {
        // Admin tries to update root
        vm.prank(admin);
        vm.expectRevert("Not authorized: oracle only");
        registry.updateRoot(testRoot1, 100, testIpfsCid1);
    }

    function testIsRootValidAtTimestamp() public {
        uint256 timestamp1 = block.timestamp;

        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Move time forward
        vm.warp(timestamp1 + 100);
        uint256 timestamp2 = block.timestamp;

        // Update to a new root
        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);

        // Move time forward again
        vm.warp(timestamp2 + 100);
        uint256 timestamp3 = block.timestamp;

        // Update to a third root
        vm.prank(oracle);
        registry.updateRoot(testRoot3, 300, testIpfsCid3);

        // Test validity at different timestamps

        // testRoot1 should be valid at timestamp1 and timestamp2-1, but not at timestamp2 or later
        assertTrue(registry.isRootValidAtTimestamp(testRoot1, timestamp1));
        assertTrue(registry.isRootValidAtTimestamp(testRoot1, timestamp2 - 1));
        assertFalse(registry.isRootValidAtTimestamp(testRoot1, timestamp2));
        assertFalse(registry.isRootValidAtTimestamp(testRoot1, timestamp3));

        // testRoot2 should be valid at timestamp2 and timestamp3-1, but not before timestamp2 or at timestamp3 or later
        assertFalse(registry.isRootValidAtTimestamp(testRoot2, timestamp1));
        assertTrue(registry.isRootValidAtTimestamp(testRoot2, timestamp2));
        assertTrue(registry.isRootValidAtTimestamp(testRoot2, timestamp3 - 1));
        assertFalse(registry.isRootValidAtTimestamp(testRoot2, timestamp3));

        // testRoot3 should be valid at timestamp3 and later, but not before
        assertFalse(registry.isRootValidAtTimestamp(testRoot3, timestamp1));
        assertFalse(registry.isRootValidAtTimestamp(testRoot3, timestamp2));
        assertTrue(registry.isRootValidAtTimestamp(testRoot3, timestamp3));
        assertTrue(registry.isRootValidAtTimestamp(testRoot3, timestamp3 + 100));
    }

    function testRevokeRoot() public {
        uint256 initialTimestamp = block.timestamp;

        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Move time forward
        vm.warp(initialTimestamp + 100);
        uint256 midTimestamp = block.timestamp;

        // Update to a new root
        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);

        // Revoke the first root
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, true);

        // Check that the root is marked as revoked
        (,, bool revoked,,,,,) = registry.historicalRoots(testRoot1);
        assertTrue(revoked);

        // Check that the revoked root is no longer valid at any timestamp
        assertFalse(registry.isRootValidAtTimestamp(testRoot1, initialTimestamp));
        assertFalse(registry.isRootValidAtTimestamp(testRoot1, midTimestamp - 1));
    }

    function testOracleCanRevokeRoot() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Oracle revokes the root
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, true);

        // Check that the root is marked as revoked
        (,, bool revoked,,,,,) = registry.historicalRoots(testRoot1);
        assertTrue(revoked);

        // Check that the revoked root is no longer valid
        assertFalse(registry.isRootValidAtTimestamp(testRoot1, block.timestamp));
    }

    function testAdminCannotRevokeRoot() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Admin tries to revoke root
        vm.prank(admin);
        vm.expectRevert("Not authorized: oracle only");
        registry.setRevocationStatus(testRoot1, true);
    }

    function testUnrevokeRoot() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Revoke the root
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, true);

        // Check that the root is marked as revoked
        (,, bool revoked,,,,,) = registry.historicalRoots(testRoot1);
        assertTrue(revoked);

        // Check that the root is not valid
        assertFalse(registry.isRootValidAtTimestamp(testRoot1, block.timestamp));

        // Unrevolve the root
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, false);

        // Check that the root is no longer marked as revoked
        (,, revoked,,,,,) = registry.historicalRoots(testRoot1);
        assertFalse(revoked);

        // Check that the root is valid again
        assertTrue(registry.isRootValidAtTimestamp(testRoot1, block.timestamp));
    }

    function testOracleCanUnrevokeRoot() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Oracle revokes the root
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, true);

        // Oracle unrevokes the root
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, false);

        // Check that the root is no longer marked as revoked
        (,, bool revoked,,,,,) = registry.historicalRoots(testRoot1);
        assertFalse(revoked);

        // Check that the root is valid again
        assertTrue(registry.isRootValidAtTimestamp(testRoot1, block.timestamp));
    }

    function testSetOracle() public {
        // Admin sets a new oracle
        vm.prank(admin);
        registry.setOracle(newOracle);

        // Check that the oracle was updated
        assertEq(registry.oracle(), newOracle);

        // New oracle should be able to update roots
        vm.prank(newOracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);
        assertEq(registry.latestRoot(), testRoot1);

        // Old oracle should no longer be able to update roots
        vm.prank(oracle);
        vm.expectRevert("Not authorized: oracle only");
        registry.updateRoot(testRoot2, 200, testIpfsCid2);
    }

    function testOnlyAdminCanSetOracle() public {
        // Oracle tries to set a new oracle
        vm.prank(oracle);
        vm.expectRevert("Not authorized: admin only");
        registry.setOracle(newOracle);

        // User tries to set a new oracle
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        registry.setOracle(newOracle);
    }

    function testOnlyOracleCanUpdateRoot() public {
        // User tries to update root
        vm.prank(user);
        vm.expectRevert("Not authorized: oracle only");
        registry.updateRoot(testRoot1, 100, testIpfsCid1);
    }

    function testOnlyOracleCanSetRevocationStatus() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // User tries to revoke root
        vm.prank(user);
        vm.expectRevert("Not authorized: oracle only");
        registry.setRevocationStatus(testRoot1, true);
    }

    function testCannotUpdateToZeroRoot() public {
        vm.prank(oracle);
        vm.expectRevert("Root cannot be zero");
        registry.updateRoot(bytes32(0), 100, testIpfsCid1);
    }

    function testCannotSetRevocationStatusOfNonExistentRoot() public {
        vm.prank(oracle);
        vm.expectRevert("Root does not exist");
        registry.setRevocationStatus(testRoot1, true);
    }

    function testNoChangeIfSettingSameRevocationStatus() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Set revocation status to true
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, true);

        // Set revocation status to true again (should be a no-op)
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, true);

        // Check that the root is still revoked
        (,, bool revoked,,,,,) = registry.historicalRoots(testRoot1);
        assertTrue(revoked);

        // Set revocation status to false
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, false);

        // Set revocation status to false again (should be a no-op)
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, false);

        // Check that the root is still not revoked
        (,, revoked,,,,,) = registry.historicalRoots(testRoot1);
        assertFalse(revoked);
    }

    function testPauseAffectsRootValidity() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Verify root is valid
        assertTrue(registry.isRootValidAtTimestamp(testRoot1, block.timestamp));

        // Pause the contract
        vm.prank(admin);
        registry.setPaused(true);

        // Verify root is no longer valid when contract is paused
        assertFalse(registry.isRootValidAtTimestamp(testRoot1, block.timestamp));

        // Unpause the contract
        vm.prank(admin);
        registry.setPaused(false);

        // Verify root is valid again
        assertTrue(registry.isRootValidAtTimestamp(testRoot1, block.timestamp));
    }

    function testCannotUpdateRootWhenPaused() public {
        // Pause the contract
        vm.prank(admin);
        registry.setPaused(true);

        // Try to update root while paused
        vm.prank(oracle);
        vm.expectRevert("Contract is paused");
        registry.updateRoot(testRoot1, 100, testIpfsCid1);
    }

    function testCannotSetRevocationStatusWhenPaused() public {
        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Pause the contract
        vm.prank(admin);
        registry.setPaused(true);

        // Try to set revocation status while paused
        vm.prank(oracle);
        vm.expectRevert("Contract is paused");
        registry.setRevocationStatus(testRoot1, true);
    }

    function testSetRootValidationMode() public {
        // Check initial mode is LATEST_ONLY
        assertEq(uint256(registry.rootValidationMode()), uint256(IRegistryInstance.RootValidationMode.LATEST_ONLY));

        // Admin changes mode to TIMESTAMP_BASED
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.TIMESTAMP_BASED);
        assertEq(
            uint256(registry.rootValidationMode()), uint256(IRegistryInstance.RootValidationMode.TIMESTAMP_BASED)
        );

        // Admin changes mode to LATEST_AND_PREVIOUS
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_AND_PREVIOUS);
        assertEq(
            uint256(registry.rootValidationMode()), uint256(IRegistryInstance.RootValidationMode.LATEST_AND_PREVIOUS)
        );
    }

    function testOnlyAdminCanSetRootValidationMode() public {
        // User tries to set mode
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.TIMESTAMP_BASED);

        // Oracle tries to set mode
        vm.prank(oracle);
        vm.expectRevert("Not authorized: admin only");
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.TIMESTAMP_BASED);
    }

    function testLatestAndPreviousModeWithSingleRoot() public {
        // Set mode to LATEST_AND_PREVIOUS
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_AND_PREVIOUS);

        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Only the latest root should be valid
        assertTrue(registry.isRootValid(testRoot1, block.timestamp));
        assertFalse(registry.isRootValid(testRoot2, block.timestamp));
    }

    function testLatestAndPreviousModeWithTwoRoots() public {
        // Set mode to LATEST_AND_PREVIOUS
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_AND_PREVIOUS);

        // Set first root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Move time forward
        vm.warp(block.timestamp + 100);

        // Set second root
        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);

        // Both latest (testRoot2) and previous (testRoot1) should be valid
        assertTrue(registry.isRootValid(testRoot2, block.timestamp)); // Latest
        assertTrue(registry.isRootValid(testRoot1, block.timestamp)); // Previous
        assertFalse(registry.isRootValid(testRoot3, block.timestamp)); // Non-existent
    }

    function testLatestAndPreviousModeWithThreeRoots() public {
        // Set mode to LATEST_AND_PREVIOUS
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_AND_PREVIOUS);

        // Set first root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Move time forward and set second root
        vm.warp(block.timestamp + 100);
        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);

        // Move time forward and set third root
        vm.warp(block.timestamp + 100);
        vm.prank(oracle);
        registry.updateRoot(testRoot3, 300, testIpfsCid3);

        // Only latest (testRoot3) and previous (testRoot2) should be valid
        assertTrue(registry.isRootValid(testRoot3, block.timestamp)); // Latest
        assertTrue(registry.isRootValid(testRoot2, block.timestamp)); // Previous
        assertFalse(registry.isRootValid(testRoot1, block.timestamp)); // Older than previous
    }

    function testLatestAndPreviousModeSwitchingBehavior() public {
        // Set three roots
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);
        vm.warp(block.timestamp + 100);
        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);
        vm.warp(block.timestamp + 100);
        vm.prank(oracle);
        registry.updateRoot(testRoot3, 300, testIpfsCid3);

        // In LATEST_ONLY mode, only testRoot3 should be valid
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_ONLY);
        assertTrue(registry.isRootValid(testRoot3, block.timestamp));
        assertFalse(registry.isRootValid(testRoot2, block.timestamp));
        assertFalse(registry.isRootValid(testRoot1, block.timestamp));

        // Switch to LATEST_AND_PREVIOUS mode
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_AND_PREVIOUS);
        assertTrue(registry.isRootValid(testRoot3, block.timestamp)); // Latest
        assertTrue(registry.isRootValid(testRoot2, block.timestamp)); // Previous
        assertFalse(registry.isRootValid(testRoot1, block.timestamp)); // Older

        // Switch to TIMESTAMP_BASED mode
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.TIMESTAMP_BASED);
        // Only testRoot3 should be valid at the current timestamp because it's the latest
        assertTrue(registry.isRootValid(testRoot3, block.timestamp));
        // testRoot2 and testRoot1 are not valid at current timestamp because their validTo has passed
        assertFalse(registry.isRootValid(testRoot2, block.timestamp));
        assertFalse(registry.isRootValid(testRoot1, block.timestamp));
    }

    function testLatestAndPreviousModeWithNoRoots() public view {
        // Set mode to LATEST_AND_PREVIOUS (mode doesn't matter when there are no roots)
        // No roots have been set
        // All roots should be invalid
        assertFalse(registry.isRootValid(testRoot1, block.timestamp));
        assertFalse(registry.isRootValid(testRoot2, block.timestamp));
    }

    function testRevokedRootInLatestOnlyMode() public {
        // Set mode to LATEST_ONLY
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_ONLY);

        // Set initial root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Verify root is valid
        assertTrue(registry.isRootValid(testRoot1, block.timestamp));

        // Revoke the root
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, true);

        // Verify root is no longer valid even though it's the latest
        assertFalse(registry.isRootValid(testRoot1, block.timestamp));
    }

    function testRevokedRootInLatestAndPreviousMode() public {
        // Set mode to LATEST_AND_PREVIOUS
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_AND_PREVIOUS);

        // Set first root
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);

        // Move time forward and set second root
        vm.warp(block.timestamp + 100);
        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);

        // Both roots should be valid
        assertTrue(registry.isRootValid(testRoot2, block.timestamp)); // Latest
        assertTrue(registry.isRootValid(testRoot1, block.timestamp)); // Previous

        // Revoke the latest root
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot2, true);

        // Latest root should now be invalid
        assertFalse(registry.isRootValid(testRoot2, block.timestamp));
        // Previous root should still be valid
        assertTrue(registry.isRootValid(testRoot1, block.timestamp));

        // Revoke the previous root as well
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot1, true);

        // Both roots should now be invalid
        assertFalse(registry.isRootValid(testRoot2, block.timestamp));
        assertFalse(registry.isRootValid(testRoot1, block.timestamp));
    }

    function testRevokedRootInAllModes() public {
        // Set three roots
        vm.prank(oracle);
        registry.updateRoot(testRoot1, 100, testIpfsCid1);
        vm.warp(block.timestamp + 100);
        vm.prank(oracle);
        registry.updateRoot(testRoot2, 200, testIpfsCid2);
        vm.warp(block.timestamp + 100);
        vm.prank(oracle);
        registry.updateRoot(testRoot3, 300, testIpfsCid3);

        // Revoke testRoot2
        vm.prank(oracle);
        registry.setRevocationStatus(testRoot2, true);

        // In LATEST_ONLY mode, testRoot2 should be invalid (not latest + revoked)
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_ONLY);
        assertFalse(registry.isRootValid(testRoot2, block.timestamp));
        assertTrue(registry.isRootValid(testRoot3, block.timestamp)); // Latest is not revoked

        // In LATEST_AND_PREVIOUS mode, testRoot2 should be invalid (is previous but revoked)
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.LATEST_AND_PREVIOUS);
        assertFalse(registry.isRootValid(testRoot2, block.timestamp)); // Previous but revoked
        assertTrue(registry.isRootValid(testRoot3, block.timestamp)); // Latest is not revoked

        // In TIMESTAMP_BASED mode, testRoot2 should be invalid (revoked)
        vm.prank(admin);
        registry.setRootValidationMode(IRegistryInstance.RootValidationMode.TIMESTAMP_BASED);
        assertFalse(registry.isRootValid(testRoot2, block.timestamp)); // Revoked
    }
}
