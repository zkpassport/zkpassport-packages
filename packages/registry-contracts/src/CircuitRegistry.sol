// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

import {RegistryInstance} from "./RegistryInstance.sol";
import {RootValidationMode} from "./IRegistryInstance.sol";

/**
 * @title CircuitRegistry
 * @dev ZKPassport Circuit Registry
 */
contract CircuitRegistry is RegistryInstance {
    constructor(
        address _admin,
        address _oracle,
        uint256 _treeHeight,
        RootValidationMode _rootValidationMode,
        uint256 _validityWindowSecs
    ) RegistryInstance(_admin, _oracle, _treeHeight, _rootValidationMode, _validityWindowSecs) {}
}
