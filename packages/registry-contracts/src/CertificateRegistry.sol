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
 * @title CertificateRegistry
 * @dev ZKPassport Certificate Registry
 */
contract CertificateRegistry is RegistryInstance {
    constructor(address _admin, address _oracle)
        RegistryInstance(_admin, _oracle, 16, RootValidationMode.VALID_WITHIN_WINDOW, 86400)
    {}
}
