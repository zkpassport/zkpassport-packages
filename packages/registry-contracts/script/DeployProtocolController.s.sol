/*
 * DeployProtocolController.s.sol
 *
 * Deploys the protocol controller.
 */

pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ProtocolController} from "../src/ProtocolController.sol";

contract DeployProtocolControllerScript is Script {
    ProtocolController public controller;

    function setUp() public {}

    function run() public {
        address adminAddress = vm.envAddress("PROTOCOL_CONTROLLER_ADMIN");
        require(adminAddress != address(0), "PROTOCOL_CONTROLLER_ADMIN must be set");

        address rootRegistry = vm.envAddress("ROOT_REGISTRY_ADDRESS");
        require(rootRegistry != address(0), "ROOT_REGISTRY_ADDRESS must be set");

        address rootRegistryOperator = vm.envAddress("ROOT_REGISTRY_OPERATOR_ADDRESS");
        require(rootRegistryOperator != address(0), "ROOT_REGISTRY_OPERATOR_ADDRESS must be set");

        address rootVerifier = vm.envAddress("ROOT_VERIFIER_ADDRESS");
        require(rootVerifier != address(0), "ROOT_VERIFIER_ADDRESS must be set");

        address rootVerifierOperator = vm.envAddress("ROOT_VERIFIER_OPERATOR_ADDRESS");
        require(rootVerifierOperator != address(0), "ROOT_VERIFIER_OPERATOR_ADDRESS must be set");

        vm.startBroadcast();
        controller = new ProtocolController(
            adminAddress, rootRegistry, rootRegistryOperator, rootVerifier, rootVerifierOperator
        );
        vm.stopBroadcast();

        console.log("ProtocolController deployed at:", address(controller));
        console.log("Admin:", controller.admin());
        console.log("Root Registry:", address(controller.rootRegistry()));
        console.log("Root Registry Operator:", controller.rootRegistryOperator());
        console.log("Root Verifier:", address(controller.rootVerifier()));
        console.log("Root Verifier Operator:", controller.rootVerifierOperator());
    }
}
