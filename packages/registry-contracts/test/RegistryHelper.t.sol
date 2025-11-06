pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/RootRegistry.sol";
import "../src/CertificateRegistry.sol";
import "../src/RegistryHelper.sol";
import {RootValidationMode} from "../src/IRegistryInstance.sol";
import {TestConstants} from "./TestConstants.sol";
import {MockRegistry} from "./MockRegistry.sol";

contract RegistryHelperTest is Test {
    bytes32 constant CERTIFICATE_REGISTRY_ID = 0x0000000000000000000000000000000000000000000000000000000000000001;
    bytes32 constant MOCK_REGISTRY_ID = 0x0000000000000000000000000000000000000000000000000000000000000002;

    RootRegistry public rootRegistry;
    CertificateRegistry public registry;
    RegistryHelper public helper;
    MockRegistry public mockValidRegistry;
    MockRegistry public mockInvalidRegistry;

    address admin = address(0x1);
    address oracle = address(0x2);
    address guardian = address(0x3);

    bytes32 public constant testRoot = keccak256("test-root");

    function setUp() public {
        vm.startPrank(admin);
        registry = new CertificateRegistry(
            admin,
            oracle,
            TestConstants.DEFAULT_TREE_HEIGHT,
            TestConstants.DEFAULT_VALIDATION_MODE,
            TestConstants.DEFAULT_VALIDITY_WINDOW
        );
        rootRegistry = new RootRegistry(admin, guardian);
        rootRegistry.updateRegistry(CERTIFICATE_REGISTRY_ID, registry);
        helper = new RegistryHelper(rootRegistry);
        vm.stopPrank();

        mockValidRegistry = new MockRegistry(true);
        mockInvalidRegistry = new MockRegistry(false);
    }

    function testGetHistoricalRootsEmptyRegistry() public view {
        (RegistryHelper.RootDetails[] memory roots, bool isLastPage) =
            helper.getHistoricalRoots(CERTIFICATE_REGISTRY_ID, 1, 10);

        assertEq(roots.length, 0);
        assertTrue(isLastPage);
    }

    function testGetHistoricalRootsSingleRoot() public {
        bytes32 root1 = bytes32(uint256(1));
        bytes32 ipfsCid1 = bytes32(uint256(100));

        vm.prank(oracle);
        registry.updateRootWithMetadata(root1, 100, ipfsCid1, bytes32(0), bytes32(0), bytes32(0));

        (RegistryHelper.RootDetails[] memory roots, bool isLastPage) =
            helper.getHistoricalRoots(CERTIFICATE_REGISTRY_ID, 1, 10);

        assertEq(roots.length, 1);
        assertEq(roots[0].root, root1);
        assertEq(roots[0].cid, ipfsCid1);
        assertEq(roots[0].index, 1);
        assertTrue(isLastPage);
    }

    function testGetHistoricalRootsMultipleRoots() public {
        bytes32 root1 = bytes32(uint256(1));
        bytes32 root2 = bytes32(uint256(2));
        bytes32 root3 = bytes32(uint256(3));

        bytes32 ipfsCid1 = bytes32(uint256(100));
        bytes32 ipfsCid2 = bytes32(uint256(200));
        bytes32 ipfsCid3 = bytes32(uint256(300));

        vm.prank(oracle);
        registry.updateRootWithMetadata(root1, 100, ipfsCid1, bytes32(0), bytes32(0), bytes32(0));
        vm.prank(oracle);
        registry.updateRootWithMetadata(root2, 200, ipfsCid2, bytes32(0), bytes32(0), bytes32(0));
        vm.prank(oracle);
        registry.updateRootWithMetadata(root3, 300, ipfsCid3, bytes32(0), bytes32(0), bytes32(0));

        (RegistryHelper.RootDetails[] memory roots, bool isLastPage) =
            helper.getHistoricalRoots(CERTIFICATE_REGISTRY_ID, 1, 10);

        assertEq(roots.length, 3);
        assertEq(roots[0].root, root1);
        assertEq(roots[0].cid, ipfsCid1);
        assertEq(roots[0].index, 1);

        assertEq(roots[1].root, root2);
        assertEq(roots[1].cid, ipfsCid2);
        assertEq(roots[1].index, 2);

        assertEq(roots[2].root, root3);
        assertEq(roots[2].cid, ipfsCid3);
        assertEq(roots[2].index, 3);

        assertTrue(isLastPage);

        // Test count function
        assertEq(helper.totalHistoricalRoots(CERTIFICATE_REGISTRY_ID), 3);
    }

    function testGetHistoricalRootsPagination() public {
        bytes32[5] memory roots;
        bytes32[5] memory ipfsCids;

        // Create 5 roots
        for (uint256 i = 0; i < 5; i++) {
            roots[i] = bytes32(uint256(i + 1));
            ipfsCids[i] = bytes32(uint256(100 + i));

            vm.prank(oracle);
            registry.updateRootWithMetadata(roots[i], 100 + i, ipfsCids[i], bytes32(0), bytes32(0), bytes32(0));
        }

        // Test first page with 2 items per page
        (RegistryHelper.RootDetails[] memory page1, bool isLastPage1) =
            helper.getHistoricalRoots(CERTIFICATE_REGISTRY_ID, 1, 2);

        assertEq(page1.length, 2);
        assertEq(page1[0].root, roots[0]);
        assertEq(page1[0].index, 1);
        assertEq(page1[1].root, roots[1]);
        assertEq(page1[1].index, 2);
        assertFalse(isLastPage1);

        // Test second page starting from index 3
        (RegistryHelper.RootDetails[] memory page2, bool isLastPage2) =
            helper.getHistoricalRoots(CERTIFICATE_REGISTRY_ID, 3, 2);

        assertEq(page2.length, 2);
        assertEq(page2[0].root, roots[2]);
        assertEq(page2[0].index, 3);
        assertEq(page2[1].root, roots[3]);
        assertEq(page2[1].index, 4);
        assertFalse(isLastPage2);

        // Test third page with 2 items per page (should only have 1 item)
        (RegistryHelper.RootDetails[] memory page3, bool isLastPage3) =
            helper.getHistoricalRoots(CERTIFICATE_REGISTRY_ID, 5, 2);

        assertEq(page3.length, 1);
        assertEq(page3[0].root, roots[4]);
        assertEq(page3[0].index, 5);
        assertTrue(isLastPage3);

        // Test out of bounds index
        vm.expectRevert("Start index out of bounds");
        helper.getHistoricalRoots(CERTIFICATE_REGISTRY_ID, 6, 2);
    }

    function testGetHistoricalRootsByHash() public {
        bytes32[5] memory roots;
        bytes32[5] memory ipfsCids;

        // Create 5 roots
        for (uint256 i = 0; i < 5; i++) {
            roots[i] = bytes32(uint256(i + 1));
            ipfsCids[i] = bytes32(uint256(100 + i));

            vm.prank(oracle);
            registry.updateRootWithMetadata(roots[i], 100 + i, ipfsCids[i], bytes32(0), bytes32(0), bytes32(0));
        }

        // Test getting roots by hash
        (RegistryHelper.RootDetails[] memory roots1, bool isLastPage1) =
            helper.getHistoricalRootsByHash(CERTIFICATE_REGISTRY_ID, bytes32(0), 3);

        assertEq(roots1.length, 3);
        assertEq(roots1[0].root, roots[0]);
        assertEq(roots1[1].root, roots[1]);
        assertEq(roots1[2].root, roots[2]);
        assertFalse(isLastPage1);

        // Test getting roots starting from a specific hash
        (RegistryHelper.RootDetails[] memory roots2, bool isLastPage2) =
            helper.getHistoricalRootsByHash(CERTIFICATE_REGISTRY_ID, roots[1], 2);

        assertEq(roots2.length, 2);
        assertEq(roots2[0].root, roots[2]);
        assertEq(roots2[1].root, roots[3]);
        assertFalse(isLastPage2);

        // Test invalid hash
        vm.expectRevert("Starting root not found");
        helper.getHistoricalRootsByHash(CERTIFICATE_REGISTRY_ID, bytes32(uint256(999)), 2);
    }

    function testGetLatestRootDetails() public {
        bytes32 root1 = bytes32(uint256(1));
        bytes32 root2 = bytes32(uint256(2));

        bytes32 ipfsCid1 = bytes32(uint256(100));
        bytes32 ipfsCid2 = bytes32(uint256(200));

        vm.prank(oracle);
        registry.updateRootWithMetadata(root1, 100, ipfsCid1, bytes32(0), bytes32(0), bytes32(0));
        vm.prank(oracle);
        registry.updateRootWithMetadata(root2, 200, ipfsCid2, bytes32(0), bytes32(0), bytes32(0));

        RegistryHelper.RootDetails memory latest = helper.getLatestRootDetails(CERTIFICATE_REGISTRY_ID);

        assertEq(latest.root, root2);
        assertEq(latest.cid, ipfsCid2);
        assertEq(latest.index, 2);
    }

    function testGetLatestRootDetailsWithNoRoots() public {
        vm.expectRevert("No roots exist yet");
        helper.getLatestRootDetails(CERTIFICATE_REGISTRY_ID);
    }

    function testGetRootDetailsByIndex() public {
        // Create multiple roots
        bytes32[] memory roots = new bytes32[](3);
        bytes32[] memory ipfsCids = new bytes32[](3);
        uint256[] memory leaves = new uint256[](3);

        // Create 3 roots with different metadata
        for (uint256 i = 0; i < 3; i++) {
            roots[i] = bytes32(uint256(i + 1));
            ipfsCids[i] = bytes32(uint256(100 + i));
            leaves[i] = 50 + i * 10;

            vm.prank(oracle);
            registry.updateRootWithMetadata(roots[i], leaves[i], ipfsCids[i], bytes32(0), bytes32(0), bytes32(0));
        }

        // Test getting root by index
        RegistryHelper.RootDetails memory details = helper.getRootDetailsByIndex(CERTIFICATE_REGISTRY_ID, 2);

        // Verify the details match the second root we created
        assertEq(details.index, 2);
        assertEq(details.root, roots[1]);
        assertEq(details.leaves, leaves[1]);
        assertEq(details.cid, ipfsCids[1]);
        assertEq(details.validFrom, block.timestamp);
        assertFalse(details.revoked);
    }

    function testGetRootDetailsByIndexInvalidIndex() public {
        bytes32 root1 = bytes32(uint256(1));
        bytes32 ipfsCid1 = bytes32(uint256(100));

        vm.prank(oracle);
        registry.updateRootWithMetadata(root1, 100, ipfsCid1, bytes32(0), bytes32(0), bytes32(0));

        // Test with index 0 (invalid, as indexing starts at 1)
        vm.expectRevert();
        helper.getRootDetailsByIndex(CERTIFICATE_REGISTRY_ID, 0);

        // Test with index out of bounds
        vm.expectRevert("Root not found");
        helper.getRootDetailsByIndex(CERTIFICATE_REGISTRY_ID, 2);
    }

    function testGetRootDetailsByIndexEmptyRegistry() public {
        // Test with empty registry
        vm.expectRevert();
        helper.getRootDetailsByIndex(CERTIFICATE_REGISTRY_ID, 1);
    }

    function testGetRootDetailsByRoot() public {
        // Create multiple roots
        bytes32[] memory roots = new bytes32[](3);
        bytes32[] memory ipfsCids = new bytes32[](3);
        uint256[] memory leaves = new uint256[](3);

        // Create 3 roots with different metadata
        for (uint256 i = 0; i < 3; i++) {
            roots[i] = bytes32(uint256(i + 1));
            ipfsCids[i] = bytes32(uint256(100 + i));
            leaves[i] = 50 + i * 10;

            vm.prank(oracle);
            registry.updateRootWithMetadata(roots[i], leaves[i], ipfsCids[i], bytes32(0), bytes32(0), bytes32(0));
        }

        // Test getting root by hash for the second root
        RegistryHelper.RootDetails memory details = helper.getRootDetailsByRoot(CERTIFICATE_REGISTRY_ID, roots[1]);

        // Verify the details match the second root we created
        assertEq(details.index, 2);
        assertEq(details.root, roots[1]);
        assertEq(details.leaves, leaves[1]);
        assertEq(details.cid, ipfsCids[1]);
        assertEq(details.validFrom, block.timestamp);
        assertFalse(details.revoked);
    }

    function testGetRootDetailsByRootInvalidRoot() public {
        bytes32 root1 = bytes32(uint256(1));
        bytes32 ipfsCid1 = bytes32(uint256(100));

        vm.prank(oracle);
        registry.updateRootWithMetadata(root1, 100, ipfsCid1, bytes32(0), bytes32(0), bytes32(0));

        // Test with zero root hash
        vm.expectRevert("Root hash cannot be zero");
        helper.getRootDetailsByRoot(CERTIFICATE_REGISTRY_ID, bytes32(0));

        // Test with non-existent root
        vm.expectRevert("Root not found");
        helper.getRootDetailsByRoot(CERTIFICATE_REGISTRY_ID, bytes32(uint256(999)));
    }

    function testGetRootDetailsByRootEmptyRegistry() public {
        // Test with empty registry and valid root hash
        vm.expectRevert("Root not found");
        helper.getRootDetailsByRoot(CERTIFICATE_REGISTRY_ID, bytes32(uint256(1)));
    }

    function testIsRootValidAtTimestamp() public {
        // Set up registry with valid mock
        vm.prank(admin);
        rootRegistry.updateRegistry(MOCK_REGISTRY_ID, mockValidRegistry);

        // Check that root is valid at current timestamp
        assertTrue(helper.isRootValidAtTimestamp(MOCK_REGISTRY_ID, testRoot, block.timestamp));

        // Update registry to invalid mock
        vm.prank(admin);
        rootRegistry.updateRegistry(MOCK_REGISTRY_ID, mockInvalidRegistry);

        // Check that root is now invalid at current timestamp
        assertFalse(helper.isRootValidAtTimestamp(MOCK_REGISTRY_ID, testRoot, block.timestamp));
    }

    function testIsRootValidAtTimestampWithNonExistentRegistry() public view {
        // Use a registry identifier that is guaranteed to be non-existent
        bytes32 nonExistentRegistryId = keccak256("non-existent-registry");

        // Check that root is invalid for non-existent registry
        assertFalse(helper.isRootValidAtTimestamp(nonExistentRegistryId, testRoot, block.timestamp));
    }

    function testIsRootValidAtTimestampWhenPaused() public {
        // Set up registry with valid mock
        vm.prank(admin);
        rootRegistry.updateRegistry(MOCK_REGISTRY_ID, mockValidRegistry);

        // Check that root is valid at current timestamp
        assertTrue(helper.isRootValidAtTimestamp(MOCK_REGISTRY_ID, testRoot, block.timestamp));

        // Pause the contract
        vm.prank(guardian);
        rootRegistry.setPaused(true);

        // Check that root is now invalid at current timestamp
        assertFalse(helper.isRootValidAtTimestamp(MOCK_REGISTRY_ID, testRoot, block.timestamp));
    }

    function testIsRootValidAtTimestampWithTimeWarp() public {
        // Create two roots at different timestamps
        bytes32 root1 = bytes32(uint256(1));
        bytes32 root2 = bytes32(uint256(2));
        bytes32 ipfsCid1 = bytes32(uint256(100));
        bytes32 ipfsCid2 = bytes32(uint256(200));

        // Set initial timestamp
        uint256 timestamp1 = 1000;
        vm.warp(timestamp1);

        // Add first root at timestamp 1000
        vm.prank(oracle);
        registry.updateRoot(root1, bytes32(0), timestamp1, 100, ipfsCid1);

        // Add second root at timestamp 2000 (this will set root1's validTo to 1999)
        uint256 timestamp2 = 2000;
        vm.warp(timestamp2);
        vm.prank(oracle);
        registry.updateRoot(root2, root1, timestamp2, 200, ipfsCid2);

        // Test root1 at timestamp 1500 (should be valid)
        uint256 testTimestamp = 1500;
        assertTrue(
            helper.isRootValidAtTimestamp(CERTIFICATE_REGISTRY_ID, root1, testTimestamp),
            "Root1 should be valid at timestamp 1500"
        );

        // Warp to a time when root1 is no longer valid (timestamp2 or later)
        vm.warp(2500);

        // Test root1 at timestamp 2500 (should be invalid - after its validTo of 1999)
        assertFalse(
            helper.isRootValidAtTimestamp(CERTIFICATE_REGISTRY_ID, root1, 2500),
            "Root1 should be invalid at timestamp 2500"
        );

        // Test root2 at timestamp 2500 (should be valid)
        assertTrue(
            helper.isRootValidAtTimestamp(CERTIFICATE_REGISTRY_ID, root2, 2500),
            "Root2 should be valid at timestamp 2500"
        );
    }
}
