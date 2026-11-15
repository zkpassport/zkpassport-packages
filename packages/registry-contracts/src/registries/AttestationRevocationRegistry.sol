// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

import {RegistryInstance} from "../RegistryInstance.sol";
import {RootValidationMode} from "../IRegistryInstance.sol";

/**
 * @title AttestationRevocationRegistry
 * @dev Roots of the ordered Merkle tree of revoked Android attestation certificate serial numbers,
 * built from Google's attestation status list, that the Android face match circuits prove each
 * intermediate certificate of the attestation chain is absent from
 */
contract AttestationRevocationRegistry is RegistryInstance {
    constructor(address _admin, address _oracle, address _guardian)
        RegistryInstance(_admin, _oracle, _guardian, 20, RootValidationMode.VALID_WITHIN_WINDOW, 86400)
    {}
}
