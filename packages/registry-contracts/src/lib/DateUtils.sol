// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

library DateUtils {
    function isDateValid(uint256 timestamp, uint256 validityPeriodInSeconds) internal view returns (bool) {
        uint256 validityPeriodTimestamp = timestamp + validityPeriodInSeconds;
        return
            block.timestamp >= timestamp && validityPeriodTimestamp > timestamp && validityPeriodTimestamp > block.timestamp;
    }
}
