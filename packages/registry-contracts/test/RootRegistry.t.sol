pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/RootRegistry.sol";
import "./MockRegistry.sol";

contract RootRegistryTest is Test {
    RootRegistry public registry;
    MockRegistry public mockValidRegistry;
    MockRegistry public mockInvalidRegistry;

    address public admin = address(1);
    address public guardian = address(2);
    address public user = address(3);

    bytes32 public constant certificateRegistryId = keccak256("zkpassport-certificate-registry");
    bytes32 public constant circuitRegistryId = keccak256("zkpassport-circuit-registry");
    bytes32 public constant testRoot = keccak256("test-root");

    // Events from RootRegistry
    event RootRegistryDeployed(address indexed admin, address indexed guardian);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);
    event RegistryAdded(bytes32 indexed registryId, address indexed registryAddress);
    event RegistryUpdated(bytes32 indexed registryId, address indexed oldAddress, address indexed newAddress);
    event RegistryRemoved(bytes32 indexed registryId, address indexed registryAddress);
    event PausedStatusChanged(bool paused);

    function setUp() public {
        vm.prank(admin);
        registry = new RootRegistry(admin, guardian);

        mockValidRegistry = new MockRegistry(true);
        mockInvalidRegistry = new MockRegistry(false);
    }

    function testDeployment() public {
        // Expect the RootRegistryDeployed event
        vm.expectEmit(true, true, false, false);
        emit RootRegistryDeployed(admin, guardian);

        // Deploy a new root registry
        vm.prank(admin);
        RootRegistry newRegistry = new RootRegistry(admin, guardian);

        // Verify initialization
        assertEq(newRegistry.admin(), admin);
        assertEq(newRegistry.guardian(), guardian);
        assertEq(newRegistry.registryCount(), 0);
    }

    function testAddRegistry() public {
        // Expect the RegistryAdded event
        vm.expectEmit(true, true, false, false);
        emit RegistryAdded(certificateRegistryId, address(mockValidRegistry));

        // Admin adds registry
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // Check that registry address was added
        assertEq(address(registry.registries(certificateRegistryId)), address(mockValidRegistry));
        // Check that counter was incremented
        assertEq(registry.registryCount(), 1);
    }

    function testUpdateRegistry() public {
        // Admin adds registry
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);
        assertEq(registry.registryCount(), 1);

        // Expect the RegistryUpdated event
        vm.expectEmit(true, true, true, false);
        emit RegistryUpdated(certificateRegistryId, address(mockValidRegistry), address(mockInvalidRegistry));

        // Update to a different address
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockInvalidRegistry);

        // Check that registry address was updated
        assertEq(address(registry.registries(certificateRegistryId)), address(mockInvalidRegistry));
        // Check that counter remains the same when updating existing registry
        assertEq(registry.registryCount(), 1);
    }

    function testRemoveRegistry() public {
        // Admin adds registry
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

       // Check that registry address was added
        assertEq(address(registry.registries(certificateRegistryId)), address(mockValidRegistry));
        // Verify counter was incremented
        assertEq(registry.registryCount(), 1);

        // Expect the RegistryRemoved event
        vm.expectEmit(true, true, false, false);
        emit RegistryRemoved(certificateRegistryId, address(mockValidRegistry));

        // Admin removes registry
        vm.prank(admin);
        registry.removeRegistry(certificateRegistryId);

        // Check that registry address was removed
        assertEq(address(registry.registries(certificateRegistryId)), address(0));
        // Check that counter was decremented
        assertEq(registry.registryCount(), 0);

        // Verify that isRootValid returns false for the removed registry
        // This behavior should be the same as for a non-existent registry
        assertFalse(registry.isRootValid(certificateRegistryId, testRoot, block.timestamp));
    }

    function testOnlyAdminCanAddRegistry() public {
        // User tries to add registry
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        registry.addRegistry(certificateRegistryId, mockValidRegistry);
    }

    function testOnlyAdminCanUpdateRegistry() public {
        // First add a registry
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // User tries to update registry
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        registry.updateRegistry(certificateRegistryId, mockInvalidRegistry);
    }

    function testOnlyAdminCanRemoveRegistry() public {
        // First add a registry
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // User tries to remove registry
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        registry.removeRegistry(certificateRegistryId);
    }

    function testIsRootValid() public {
        // Set up registry with valid mock
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // Check that root is valid
        assertTrue(registry.isRootValid(certificateRegistryId, testRoot, block.timestamp));

        // Update registry to invalid mock
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockInvalidRegistry);

        // Check that root is now invalid
        assertFalse(registry.isRootValid(certificateRegistryId, testRoot, block.timestamp));
    }

    function testIsRootValidWithNonExistentRegistry() public view {
        // Use a registry identifier that is guaranteed to be non-existent
        bytes32 nonExistentRegistryId = keccak256("non-existent-registry");

        // Check that root is invalid for non-existent registry
        assertFalse(registry.isRootValid(nonExistentRegistryId, testRoot, block.timestamp));
    }

    function testIsRootValidWhenPaused() public {
        // Set up registry with valid mock
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // Check that root is valid
        assertTrue(registry.isRootValid(certificateRegistryId, testRoot, block.timestamp));

        // Pause the contract
        vm.prank(guardian);
        registry.setPaused(true);

        // Check that root is now invalid
        assertFalse(registry.isRootValid(certificateRegistryId, testRoot, block.timestamp));
    }

    function testTransferAdmin() public {
        // Admin transfers admin role
        vm.prank(admin);
        registry.transferAdmin(user);

        // Check that admin was updated
        assertEq(registry.admin(), user);

        // New admin should be able to add registry
        vm.prank(user);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // Old admin should no longer be able to add registry
        vm.prank(admin);
        vm.expectRevert("Not authorized: admin only");
        registry.addRegistry(circuitRegistryId, mockValidRegistry);
    }

    function testCannotTransferAdminToZeroAddress() public {
        // Admin tries to transfer admin role to zero address
        vm.prank(admin);
        vm.expectRevert("Admin cannot be zero address");
        registry.transferAdmin(address(0));
    }

    function testOnlyAdminOrGuardianCanPause() public {
        // Guardian can pause
        vm.prank(guardian);
        registry.setPaused(true);
        assertTrue(registry.paused());

        // Guardian can unpause
        vm.prank(guardian);
        registry.setPaused(false);
        assertFalse(registry.paused());

        // Admin can also pause
        vm.prank(admin);
        registry.setPaused(true);
        assertTrue(registry.paused());

        // Admin can unpause
        vm.prank(admin);
        registry.setPaused(false);
        assertFalse(registry.paused());

        // User cannot pause
        vm.prank(user);
        vm.expectRevert("Not authorized: admin or guardian only");
        registry.setPaused(true);
    }

    function testTransferGuardian() public {
        // User cannot pause
        vm.prank(user);
        vm.expectRevert("Not authorized: admin or guardian only");
        registry.setPaused(true);

        // Admin transfers guardian role to user
        vm.prank(admin);
        registry.transferGuardian(user);

        // Check that guardian was updated
        assertEq(registry.guardian(), user);

        // New guardian should be able to pause
        vm.prank(user);
        registry.setPaused(true);
        assertTrue(registry.paused());

        // Old guardian should no longer be able to pause
        vm.prank(guardian);
        vm.expectRevert("Not authorized: admin or guardian only");
        registry.setPaused(false);
    }

    function testCanTransferGuardianToZeroAddress() public {
        // Verify guardian is set initially
        assertEq(registry.guardian(), guardian);

        // Expect the GuardianUpdated event
        vm.expectEmit(true, true, false, false);
        emit GuardianUpdated(guardian, address(0));

        // Admin transfers guardian role to zero address (removing the role)
        vm.prank(admin);
        registry.transferGuardian(address(0));

        // Check that guardian was updated to zero
        assertEq(registry.guardian(), address(0));
    }

    function testOnlyAdminCanTransferGuardian() public {
        // User tries to transfer guardian
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        registry.transferGuardian(user);

        // Guardian tries to transfer guardian
        vm.prank(guardian);
        vm.expectRevert("Not authorized: admin only");
        registry.transferGuardian(user);
    }

    function testGuardianCannotAddRegistry() public {
        // Guardian tries to add registry
        vm.prank(guardian);
        vm.expectRevert("Not authorized: admin only");
        registry.addRegistry(certificateRegistryId, mockValidRegistry);
    }

    function testGuardianCannotUpdateRegistry() public {
        // First add a registry
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // Guardian tries to update registry
        vm.prank(guardian);
        vm.expectRevert("Not authorized: admin only");
        registry.updateRegistry(certificateRegistryId, mockInvalidRegistry);
    }

    function testGuardianCannotTransferAdmin() public {
        // Guardian tries to transfer admin
        vm.prank(guardian);
        vm.expectRevert("Not authorized: admin only");
        registry.transferAdmin(user);
    }

    function testMultipleRegistries() public {
        // Set up multiple registries
        vm.startPrank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);
        registry.addRegistry(circuitRegistryId, mockInvalidRegistry);
        vm.stopPrank();

        // Check that counter is 2
        assertEq(registry.registryCount(), 2);

        // Check that roots are valid/invalid as expected
        assertTrue(registry.isRootValid(certificateRegistryId, testRoot, block.timestamp));
        assertFalse(registry.isRootValid(circuitRegistryId, testRoot, block.timestamp));

        // Update mockInvalidRegistry to return valid
        mockInvalidRegistry.setShouldReturnValid(true);

        // Check that roots are now both valid
        assertTrue(registry.isRootValid(certificateRegistryId, testRoot, block.timestamp));
        assertTrue(registry.isRootValid(circuitRegistryId, testRoot, block.timestamp));
    }

    function testDeployWithZeroGuardian() public {
        // Deploy with zero guardian
        vm.prank(admin);
        RootRegistry registryWithNoGuardian = new RootRegistry(admin, address(0));

        // Verify guardian is zero
        assertEq(registryWithNoGuardian.guardian(), address(0));

        // Verify admin is set correctly
        assertEq(registryWithNoGuardian.admin(), admin);
    }


    function testRegistryCounter() public {
        // Initially, counter should be 0
        assertEq(registry.registryCount(), 0);

        // Add first registry
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);
        assertEq(registry.registryCount(), 1);

        // Add second registry
        vm.prank(admin);
        registry.addRegistry(circuitRegistryId, mockInvalidRegistry);
        assertEq(registry.registryCount(), 2);

        // Update existing registry (counter should not change)
        vm.prank(admin);
        registry.updateRegistry(certificateRegistryId, mockInvalidRegistry);
        assertEq(registry.registryCount(), 2);

        // Remove one registry
        vm.prank(admin);
        registry.removeRegistry(certificateRegistryId);
        assertEq(registry.registryCount(), 1);

        // Remove second registry
        vm.prank(admin);
        registry.removeRegistry(circuitRegistryId);
        assertEq(registry.registryCount(), 0);
    }

    function testCannotAddExistingRegistry() public {
        // Add registry
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // Try to add the same registry again
        vm.prank(admin);
        vm.expectRevert("Registry already exists");
        registry.addRegistry(certificateRegistryId, mockInvalidRegistry);
    }

    function testCannotUpdateNonExistentRegistry() public {
        // Try to update a registry that doesn't exist
        vm.prank(admin);
        vm.expectRevert("Registry does not exist");
        registry.updateRegistry(certificateRegistryId, mockValidRegistry);
    }

    function testCannotDeleteNonExistentRegistry() public {
        // Try to delete a registry that doesn't exist
        vm.prank(admin);
        vm.expectRevert("Registry does not exist");
        registry.removeRegistry(certificateRegistryId);
    }

    function testCannotAddZeroAddress() public {
        // Try to add a zero address registry
        vm.prank(admin);
        vm.expectRevert("Registry address cannot be zero address");
        registry.addRegistry(certificateRegistryId, IRegistryInstance(address(0)));
    }

    function testCannotUpdateToZeroAddress() public {
        // Add registry first
        vm.prank(admin);
        registry.addRegistry(certificateRegistryId, mockValidRegistry);

        // Try to update to zero address
        vm.prank(admin);
        vm.expectRevert("Registry address cannot be zero address");
        registry.updateRegistry(certificateRegistryId, IRegistryInstance(address(0)));
    }
}
