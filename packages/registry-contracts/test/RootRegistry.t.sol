pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/RootRegistry.sol";

// MockRegistry for testing the delegation functionality
contract MockRegistry is IRegistryInstance {
    bool private shouldReturnValid;

    constructor(bool _shouldReturnValid) {
        shouldReturnValid = _shouldReturnValid;
    }

    function isRootValid(bytes32) external view returns (bool) {
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
}

contract RootRegistryTest is Test {
    RootRegistry public registry;
    MockRegistry public mockValidRegistry;
    MockRegistry public mockInvalidRegistry;

    address public admin = address(1);
    address public user = address(2);

    bytes32 public certificateRegistryId = keccak256("zkpassport-certificate-registry");
    bytes32 public circuitRegistryId = keccak256("zkpassport-circuit-registry");
    bytes32 public testRoot = keccak256("test-root");

    function setUp() public {
        vm.prank(admin);
        registry = new RootRegistry(admin);

        mockValidRegistry = new MockRegistry(true);
        mockInvalidRegistry = new MockRegistry(false);
    }

    function testDeploymentEvent() public {
        // Deploy a new registry to capture the event
        vm.recordLogs();
        vm.prank(admin);
        new RootRegistry(admin);

        // Get the logs
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // Find the RootRegistryDeployed event
        bool found = false;
        for (uint256 i = 0; i < entries.length; i++) {
            // The event signature is the first topic
            if (entries[i].topics[0] == keccak256("RootRegistryDeployed(address,uint256)")) {
                // The admin address is the second topic (indexed parameter)
                assertEq(address(uint160(uint256(entries[i].topics[1]))), admin);
                found = true;
                break;
            }
        }

        assertTrue(found, "RootRegistryDeployed event not emitted");
    }

    function testUpdateRegistry() public {
        // Admin updates registry address
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, IRegistryInstance(address(mockValidRegistry)));

        // Check that registry address was updated
        assertEq(address(registry.registries(certificateRegistryId)), address(mockValidRegistry));

        // Update to a different address
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, IRegistryInstance(address(mockInvalidRegistry)));

        // Check that registry address was updated
        assertEq(address(registry.registries(certificateRegistryId)), address(mockInvalidRegistry));
    }

    function testUpdateRegistryEvent() public {
        // Record logs
        vm.recordLogs();

        // Admin updates registry address
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, IRegistryInstance(address(mockValidRegistry)));

        // Get the logs
        Vm.Log[] memory entries = vm.getRecordedLogs();

        // Find the RegistryUpdated event
        bool found = false;
        for (uint256 i = 0; i < entries.length; i++) {
            if (entries[i].topics[0] == keccak256("RegistryUpdated(bytes32,address,address)")) {
                // The registry identifier is the second topic (indexed parameter)
                assertEq(bytes32(entries[i].topics[1]), certificateRegistryId);
                // The old address is the third topic (indexed parameter)
                assertEq(address(uint160(uint256(entries[i].topics[2]))), address(0));
                // The new address is the fourth topic (indexed parameter)
                assertEq(address(uint160(uint256(entries[i].topics[3]))), address(mockValidRegistry));
                found = true;
                break;
            }
        }

        assertTrue(found, "RegistryUpdated event not emitted");
    }

    function testOnlyAdminCanUpdateRegistry() public {
        // User tries to update registry
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);
    }

    function testCannotUpdateRegistryWhenPaused() public {
        // Pause the contract
        vm.prank(admin);
        registry.setPaused(true);

        // Admin tries to update registry
        vm.prank(admin);
        vm.expectRevert("Contract is paused");
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);
    }

    function testCanUpdateRegistryToZeroAddress() public {
        // Set up registry with valid mock first
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);

        // Verify registry is set
        assertEq(address(registry.registries(certificateRegistryId)), address(mockValidRegistry));

        // Admin updates registry to zero address to delete the mapping
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, IRegistryInstance(address(0)));

        // Check that registry address was updated to zero (deleted)
        assertEq(address(registry.registries(certificateRegistryId)), address(0));

        // Verify that isRootValid returns false for the deleted registry
        // This behavior should be the same as for a non-existent registry
        assertFalse(registry.isRootValid(certificateRegistryId, testRoot));
    }

    function testIsRootValid() public {
        // Set up registry with valid mock
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);

        // Check that root is valid
        assertTrue(registry.isRootValid(certificateRegistryId, testRoot));

        // Update registry to invalid mock
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockInvalidRegistry);

        // Check that root is now invalid
        assertFalse(registry.isRootValid(certificateRegistryId, testRoot));
    }

    function testIsRootValidWithNonExistentRegistry() public view {
        // Use a registry identifier that is guaranteed to be non-existent
        bytes32 nonExistentRegistryId = keccak256("non-existent-registry");

        // Check that root is invalid for non-existent registry
        assertFalse(registry.isRootValid(nonExistentRegistryId, testRoot));
    }

    function testIsRootValidWhenPaused() public {
        // Set up registry with valid mock
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);

        // Check that root is valid
        assertTrue(registry.isRootValid(certificateRegistryId, testRoot));

        // Pause the contract
        vm.prank(admin);
        registry.setPaused(true);

        // Check that root is now invalid
        assertFalse(registry.isRootValid(certificateRegistryId, testRoot));
    }

    function testIsRootValidAtTimestamp() public {
        // Set up registry with valid mock
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);

        // Check that root is valid at current timestamp
        assertTrue(registry.isRootValidAtTimestamp(certificateRegistryId, testRoot, block.timestamp));

        // Update registry to invalid mock
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockInvalidRegistry);

        // Check that root is now invalid at current timestamp
        assertFalse(registry.isRootValidAtTimestamp(certificateRegistryId, testRoot, block.timestamp));
    }

    function testIsRootValidAtTimestampWithNonExistentRegistry() public view {
        // Use a registry identifier that is guaranteed to be non-existent
        bytes32 nonExistentRegistryId = keccak256("non-existent-registry");

        // Check that root is invalid for non-existent registry
        assertFalse(registry.isRootValidAtTimestamp(nonExistentRegistryId, testRoot, block.timestamp));
    }

    function testIsRootValidAtTimestampWhenPaused() public {
        // Set up registry with valid mock
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);

        // Check that root is valid at current timestamp
        assertTrue(registry.isRootValidAtTimestamp(certificateRegistryId, testRoot, block.timestamp));

        // Pause the contract
        vm.prank(admin);
        registry.setPaused(true);

        // Check that root is now invalid at current timestamp
        assertFalse(registry.isRootValidAtTimestamp(certificateRegistryId, testRoot, block.timestamp));
    }

    function testTransferAdmin() public {
        // Admin transfers admin role
        vm.prank(admin);
        registry.transferAdmin(user);

        // Check that admin was updated
        assertEq(registry.admin(), user);

        // New admin should be able to update registry
        vm.prank(user);
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);

        // Old admin should no longer be able to update registry
        vm.prank(admin);
        vm.expectRevert("Not authorized: admin only");
        registry.updateRegistry(circuitRegistryId, mockValidRegistry);
    }

    function testCannotTransferAdminToZeroAddress() public {
        // Admin tries to transfer admin role to zero address
        vm.prank(admin);
        vm.expectRevert("Admin cannot be zero address");
        registry.transferAdmin(address(0));
    }

    function testSetPaused() public {
        // Admin pauses the contract
        vm.prank(admin);
        registry.setPaused(true);

        // Check that contract is paused
        assertTrue(registry.paused());

        // Admin unpauses the contract
        vm.prank(admin);
        registry.setPaused(false);

        // Check that contract is unpaused
        assertFalse(registry.paused());
    }

    function testOnlyAdminCanSetPaused() public {
        // User tries to pause the contract
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        registry.setPaused(true);
    }

    function testMultipleRegistries() public {
        // Set up multiple registries
        vm.startPrank(admin);
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);
        registry.updateRegistry(circuitRegistryId, mockInvalidRegistry);
        vm.stopPrank();

        // Check that roots are valid/invalid as expected
        assertTrue(registry.isRootValid(certificateRegistryId, testRoot));
        assertFalse(registry.isRootValid(circuitRegistryId, testRoot));

        // Update mockInvalidRegistry to return valid
        mockInvalidRegistry.setShouldReturnValid(true);

        // Check that roots are now both valid
        assertTrue(registry.isRootValid(certificateRegistryId, testRoot));
        assertTrue(registry.isRootValid(circuitRegistryId, testRoot));
    }
}
