/*
 * DeployBase.s.sol
 *
 * Shared base contract for deploy scripts. Provides helpers for writing
 * deployment data into the shared addresses file.
 */

pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";

abstract contract DeployBase is Script {
    string internal constant DEPLOYMENTS_DIR = "./deployments";

    function _ensureDeploymentsDir() internal {
        if (!vm.exists(DEPLOYMENTS_DIR)) {
            vm.createDir(DEPLOYMENTS_DIR, true);
        }
    }

    function _chainIdStr() internal view returns (string memory) {
        return vm.toString(block.chainid);
    }

    function _addressesFilePath() internal view returns (string memory) {
        return string.concat(DEPLOYMENTS_DIR, "/addresses-", _chainIdStr(), ".json");
    }

    /// Write a serialized JSON object to a top-level key in `addresses-<chainId>.json`.
    function _writeToAddresses(string memory key, string memory json) internal {
        _ensureDeploymentsDir();
        string memory path = _addressesFilePath();
        if (!vm.exists(path)) {
            vm.writeJson("{}", path);
        }
        vm.writeJson(json, path, string.concat(".", key));
        console.log("Updated addresses file:", path);
    }
}
