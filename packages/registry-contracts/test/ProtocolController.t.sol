pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/ProtocolController.sol";
import {RootRegistry} from "../src/RootRegistry.sol";
import {RootVerifier} from "../src/RootVerifier.sol";

contract ProtocolControllerTest is Test {
    RootRegistry public rootRegistry;
    RootVerifier public rootVerifier;
    ProtocolController public controller;

    address public admin = makeAddr("admin");
    address public registryOperator = makeAddr("registryOperator");
    address public verifierOperator = makeAddr("verifierOperator");
    address public user = makeAddr("user");
    address public newAddr = makeAddr("newAddr");

    function setUp() public {
        rootRegistry = new RootRegistry(address(this), address(0));
        rootVerifier = new RootVerifier(address(this), address(0), RootRegistry(address(0)));
        controller = new ProtocolController({
            _admin: admin,
            _rootRegistry: address(rootRegistry),
            _rootRegistryOperator: registryOperator,
            _rootVerifier: address(rootVerifier),
            _rootVerifierOperator: verifierOperator
        });

        rootRegistry.transferAdmin(address(controller));
        rootVerifier.transferAdmin(address(controller));
    }

    // ===== Deployment =====

    function testDeployment() public view {
        assertEq(controller.admin(), admin);
        assertEq(controller.rootRegistryOperator(), registryOperator);
        assertEq(controller.rootVerifierOperator(), verifierOperator);
        assertEq(address(controller.rootRegistry()), address(rootRegistry));
        assertEq(address(controller.rootVerifier()), address(rootVerifier));
    }

    function testDeployRevertsWithZeroAdmin() public {
        vm.expectRevert("Admin cannot be zero address");
        new ProtocolController(
            address(0), address(rootRegistry), registryOperator, address(rootVerifier), verifierOperator
        );
    }

    // ===== Admin: two-step admin transfer =====

    function testTransferAdmin() public {
        // Step 1: admin initiates transfer
        vm.prank(admin);
        controller.transferAdmin(newAddr);
        assertEq(controller.pendingAdmin(), newAddr);
        assertEq(controller.admin(), admin);

        // Step 2: new admin accepts
        vm.prank(newAddr);
        controller.acceptAdmin();
        assertEq(controller.admin(), newAddr);
        assertEq(controller.pendingAdmin(), address(0));

        // New admin can act, old admin cannot
        vm.prank(newAddr);
        controller.setRootRegistryOperator(user);
        assertEq(controller.rootRegistryOperator(), user);

        vm.prank(admin);
        vm.expectRevert("Not authorized: admin only");
        controller.setRootRegistryOperator(user);
    }

    function testTransferAdminReverts() public {
        vm.prank(user);
        vm.expectRevert("Not authorized: admin only");
        controller.transferAdmin(newAddr);

        vm.prank(admin);
        vm.expectRevert("Admin cannot be zero address");
        controller.transferAdmin(address(0));
    }

    function testAcceptAdminRevertsForNonPendingAdmin() public {
        vm.prank(admin);
        controller.transferAdmin(newAddr);

        vm.prank(user);
        vm.expectRevert("Not authorized: pending admin only");
        controller.acceptAdmin();

        // Original admin also cannot accept
        vm.prank(admin);
        vm.expectRevert("Not authorized: pending admin only");
        controller.acceptAdmin();
    }

    function testAdminCanOverwritePendingAdmin() public {
        vm.prank(admin);
        controller.transferAdmin(newAddr);
        assertEq(controller.pendingAdmin(), newAddr);

        // Admin changes their mind
        vm.prank(admin);
        controller.transferAdmin(user);
        assertEq(controller.pendingAdmin(), user);

        // Old pending admin can no longer accept
        vm.prank(newAddr);
        vm.expectRevert("Not authorized: pending admin only");
        controller.acceptAdmin();

        // New pending admin can accept
        vm.prank(user);
        controller.acceptAdmin();
        assertEq(controller.admin(), user);
    }

    // ===== Admin: operator role management =====

    function testSetRootRegistryOperator() public {
        vm.prank(admin);
        controller.setRootRegistryOperator(newAddr);
        assertEq(controller.rootRegistryOperator(), newAddr);
    }

    function testSetRootVerifierOperator() public {
        vm.prank(admin);
        controller.setRootVerifierOperator(newAddr);
        assertEq(controller.rootVerifierOperator(), newAddr);
    }

    function testSetOperatorRolesRevertsForNonAdmin() public {
        vm.startPrank(user);
        vm.expectRevert("Not authorized: admin only");
        controller.setRootRegistryOperator(newAddr);
        vm.expectRevert("Not authorized: admin only");
        controller.setRootVerifierOperator(newAddr);
        vm.stopPrank();
    }

    // ===== Admin: restore underlying contract admins =====

    function testRestoreRootRegistryAdmin() public {
        vm.prank(admin);
        controller.restoreRootRegistryAdmin();
        assertEq(rootRegistry.admin(), admin);
    }

    function testRestoreRootVerifierAdmin() public {
        vm.prank(admin);
        controller.restoreRootVerifierAdmin();
        assertEq(rootVerifier.admin(), admin);
    }

    function testRestoreContractAdminsRevertsForNonAdmin() public {
        vm.startPrank(user);
        vm.expectRevert("Not authorized: admin only");
        controller.restoreRootRegistryAdmin();
        vm.expectRevert("Not authorized: admin only");
        controller.restoreRootVerifierAdmin();
        vm.stopPrank();
    }

    // ===== Registry operator: delegation =====

    function testRegistryOperatorDelegation() public {
        bytes32 id = keccak256("registry1");
        bytes32 k = keccak256("key");
        bytes32 val = keccak256("val");
        address anotherAddr = makeAddr("anotherAddr");

        vm.startPrank(registryOperator);

        controller.rootRegistry_addRegistry(id, newAddr);
        assertEq(address(rootRegistry.registries(id)), newAddr);

        controller.rootRegistry_updateRegistry(id, anotherAddr);
        assertEq(address(rootRegistry.registries(id)), anotherAddr);

        controller.rootRegistry_removeRegistry(id);
        assertEq(address(rootRegistry.registries(id)), address(0));

        controller.rootRegistry_setGuardian(newAddr);
        assertEq(rootRegistry.guardian(), newAddr);

        controller.rootRegistry_updateConfig(k, val);
        assertEq(rootRegistry.config(k), val);

        controller.rootRegistry_pause();
        assertTrue(rootRegistry.paused());

        controller.rootRegistry_unpause();
        assertFalse(rootRegistry.paused());

        vm.stopPrank();
    }

    function testRegistryOperatorFunctionsRevertForUnauthorized() public {
        bytes32 id = keccak256("r");

        vm.startPrank(user);
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_addRegistry(id, newAddr);
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_updateRegistry(id, newAddr);
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_removeRegistry(id);
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_setGuardian(newAddr);
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_updateConfig(id, id);
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_pause();
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_unpause();
        vm.stopPrank();
    }

    function testAdminCanCallRegistryFunctions() public {
        bytes32 id = keccak256("registry1");
        vm.prank(admin);
        controller.rootRegistry_addRegistry(id, newAddr);
        assertEq(address(rootRegistry.registries(id)), newAddr);
    }

    // ===== Verifier operator: delegation =====

    function testVerifierOperatorDelegation() public {
        bytes32 v = keccak256("v1");
        bytes32 k = keccak256("key");
        bytes32 val = keccak256("val");

        vm.startPrank(verifierOperator);

        controller.rootVerifier_addSubVerifier(v, newAddr);
        assertEq(rootVerifier.getSubVerifier(v), newAddr);

        controller.rootVerifier_updateSubVerifier(v, user);
        assertEq(rootVerifier.getSubVerifier(v), user);

        controller.rootVerifier_removeSubVerifier(v);
        assertEq(rootVerifier.getSubVerifier(v), address(0));

        controller.rootVerifier_addHelper(v, newAddr);
        assertEq(rootVerifier.getHelper(v), newAddr);

        controller.rootVerifier_updateHelper(v, user);
        assertEq(rootVerifier.getHelper(v), user);

        controller.rootVerifier_removeHelper(v);
        assertEq(rootVerifier.getHelper(v), address(0));

        controller.rootVerifier_setGuardian(newAddr);
        assertEq(rootVerifier.guardian(), newAddr);

        controller.rootVerifier_updateConfig(k, val);
        assertEq(rootVerifier.config(k), val);

        controller.rootVerifier_pause();
        assertTrue(rootVerifier.paused());

        controller.rootVerifier_unpause();
        assertFalse(rootVerifier.paused());

        vm.stopPrank();
    }

    function testVerifierOperatorFunctionsRevertForUnauthorized() public {
        bytes32 v = keccak256("v1");

        vm.startPrank(user);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_addSubVerifier(v, newAddr);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_removeSubVerifier(v);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_updateSubVerifier(v, newAddr);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_addHelper(v, newAddr);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_removeHelper(v);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_updateHelper(v, newAddr);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_setGuardian(newAddr);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_updateConfig(v, v);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_pause();
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_unpause();
        vm.stopPrank();
    }

    function testAdminCanCallVerifierFunctions() public {
        bytes32 v = keccak256("v1");
        vm.prank(admin);
        controller.rootVerifier_addSubVerifier(v, newAddr);
        assertEq(rootVerifier.getSubVerifier(v), newAddr);
    }

    // ===== Cross-role isolation =====

    function testCrossRoleIsolation() public {
        vm.prank(registryOperator);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_pause();

        vm.prank(verifierOperator);
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_pause();
    }

    function testOperatorsCannotCallAdminOnlyFunctions() public {
        vm.prank(registryOperator);
        vm.expectRevert("Not authorized: admin only");
        controller.transferAdmin(newAddr);

        vm.prank(verifierOperator);
        vm.expectRevert("Not authorized: admin only");
        controller.transferAdmin(newAddr);
    }

    // ===== Operator role reassignment =====

    function testNewRegistryOperatorCanActAfterReassignment() public {
        vm.prank(admin);
        controller.setRootRegistryOperator(newAddr);

        vm.prank(newAddr);
        controller.rootRegistry_pause();
        assertTrue(rootRegistry.paused());

        vm.prank(registryOperator);
        vm.expectRevert("Not authorized: admin or root registry operator only");
        controller.rootRegistry_unpause();
    }

    function testNewVerifierOperatorCanActAfterReassignment() public {
        vm.prank(admin);
        controller.setRootVerifierOperator(newAddr);

        vm.prank(newAddr);
        controller.rootVerifier_pause();
        assertTrue(rootVerifier.paused());

        vm.prank(verifierOperator);
        vm.expectRevert("Not authorized: admin or root verifier operator only");
        controller.rootVerifier_unpause();
    }

    // ===== Admin transfer round-trip  =====

    function testRootRegistryAdminTransferToControllerAndBack() public {
        address multisig = makeAddr("multisig");

        RootRegistry freshRegistry = new RootRegistry(multisig, address(0));
        assertEq(freshRegistry.admin(), multisig);

        ProtocolController ctrl = new ProtocolController({
            _admin: multisig,
            _rootRegistry: address(freshRegistry),
            _rootRegistryOperator: address(0),
            _rootVerifier: address(0),
            _rootVerifierOperator: address(0)
        });

        // Multisig transfers RootRegistry admin to the controller
        vm.prank(multisig);
        freshRegistry.transferAdmin(address(ctrl));
        assertEq(freshRegistry.admin(), address(ctrl));

        // Multisig can no longer act directly on the RootRegistry
        vm.prank(multisig);
        vm.expectRevert("Not authorized: admin or guardian only");
        freshRegistry.pause();

        // Controller (via multisig as admin) can now act on the RootRegistry
        vm.prank(multisig);
        ctrl.rootRegistry_pause();
        assertTrue(freshRegistry.paused());

        vm.prank(multisig);
        ctrl.rootRegistry_unpause();
        assertFalse(freshRegistry.paused());

        // Multisig (as controller admin) transfers RootRegistry admin back to itself
        vm.prank(multisig);
        ctrl.restoreRootRegistryAdmin();
        assertEq(freshRegistry.admin(), multisig);

        // Controller can no longer act on the RootRegistry
        vm.prank(multisig);
        vm.expectRevert("Not authorized: admin or guardian only");
        ctrl.rootRegistry_pause();

        // Multisig can act directly on the RootRegistry again
        vm.prank(multisig);
        freshRegistry.pause();
        assertTrue(freshRegistry.paused());
    }

    function testRootVerifierAdminTransferToControllerAndBack() public {
        address multisig = makeAddr("multisig");

        RootVerifier freshVerifier = new RootVerifier(multisig, address(0), RootRegistry(address(0)));
        assertEq(freshVerifier.admin(), multisig);

        ProtocolController ctrl = new ProtocolController({
            _admin: multisig,
            _rootRegistry: address(0),
            _rootRegistryOperator: address(0),
            _rootVerifier: address(freshVerifier),
            _rootVerifierOperator: address(0)
        });

        // Multisig transfers RootVerifier admin to the controller
        vm.prank(multisig);
        freshVerifier.transferAdmin(address(ctrl));
        assertEq(freshVerifier.admin(), address(ctrl));

        // Multisig can no longer act directly on the RootVerifier
        vm.prank(multisig);
        vm.expectRevert("Not authorized: admin or guardian only");
        freshVerifier.pause();

        // Controller (via multisig as admin) can now act on the RootVerifier
        vm.prank(multisig);
        ctrl.rootVerifier_pause();
        assertTrue(freshVerifier.paused());

        vm.prank(multisig);
        ctrl.rootVerifier_unpause();
        assertFalse(freshVerifier.paused());

        // Multisig (as controller admin) transfers RootVerifier admin back to itself
        vm.prank(multisig);
        ctrl.restoreRootVerifierAdmin();
        assertEq(freshVerifier.admin(), multisig);

        // Controller can no longer act on the RootVerifier
        vm.prank(multisig);
        vm.expectRevert("Not authorized: admin or guardian only");
        ctrl.rootVerifier_pause();

        // Multisig can act directly on the RootVerifier again
        vm.prank(multisig);
        freshVerifier.pause();
        assertTrue(freshVerifier.paused());
    }
}
