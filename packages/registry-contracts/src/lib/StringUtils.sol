// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

library StringUtils {
    function equals(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }

    function isEmpty(string memory a) internal pure returns (bool) {
        return bytes(a).length == 0;
    }

    function startsWith(string memory a, string memory prefix) internal pure returns (bool) {
        bytes memory value = bytes(a);
        bytes memory start = bytes(prefix);
        if (value.length < start.length) return false;
        for (uint256 i = 0; i < start.length; i++) {
            if (value[i] != start[i]) return false;
        }
        return true;
    }
}
