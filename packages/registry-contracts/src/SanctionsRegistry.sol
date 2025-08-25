// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.20;

import {RegistryInstance} from "./RegistryInstance.sol";

/**
 * @title SanctionsRegistry
 * @dev ZKPassport Sanctions Registry
 */
contract SanctionsRegistry is RegistryInstance {
    constructor(address _admin, address _oracle) RegistryInstance(_admin, _oracle) {}
}
