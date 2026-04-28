/*
 * DeployProtocolController.s.sol
 *
 * Deploys the protocol controller.
 */

pragma solidity ^0.8.30;

import {console} from "forge-std/Script.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {DeployBase} from "./DeployBase.s.sol";
import {ProtocolController} from "../src/ProtocolController.sol";

contract DeployProtocolControllerScript is DeployBase {
    using stdJson for string;

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

        string memory section = "protocol_controller";
        vm.serializeAddress(section, "address", address(controller));
        vm.serializeAddress(section, "admin", adminAddress);
        vm.serializeAddress(section, "root_registry", rootRegistry);
        vm.serializeAddress(section, "root_registry_operator", rootRegistryOperator);
        vm.serializeAddress(section, "root_verifier", rootVerifier);
        vm.serializeAddress(section, "root_verifier_operator", rootVerifierOperator);
        section = vm.serializeUint(section, "deployed_at", block.timestamp);

        _writeToAddresses("protocol_controller", section);
    }
}
