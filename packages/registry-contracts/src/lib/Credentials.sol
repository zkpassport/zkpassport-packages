// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

// The assurance tier of a credential: the hundreds digit of its scheme
library CredentialTier {
    // The issuer signed the data
    uint256 constant GOVERNMENT_SIGNED = 1;
    // A device attested a camera read of the data, with a strict face match
    uint256 constant DEVICE_ATTESTED = 2;
}

// How the ID's data was verified: the last public input of the outer proof
library CredentialScheme {
    uint256 constant SCHEMES_PER_TIER = 100;
    // The eMRTD chip, signed by the issuing country (CSCA -> DSC)
    uint256 constant ICAO_CHIP = 100;
    uint256 constant UIDAI_AADHAAR = 101;
    uint256 constant JPKI = 102;
    uint256 constant ISO_MDOC = 103;
    // The data page read by camera on iOS, attested by App Attest
    uint256 constant ATTESTED_CAPTURE_IOS = 200;
    // The data page read by camera on Android, attested by Play Integrity
    uint256 constant ATTESTED_CAPTURE_ANDROID = 201;
}

library Credentials {
    function tierOf(uint256 scheme) internal pure returns (uint256) {
        return scheme / CredentialScheme.SCHEMES_PER_TIER;
    }

    /**
     * @notice Whether a policy accepts a scheme. An entry below SCHEMES_PER_TIER is a tier and
     *         stands for every scheme of that tier; any other entry is one exact scheme.
     *         An empty policy accepts signed credentials only.
     */
    function isAllowed(uint256 scheme, uint256[] memory allowedCredentials) internal pure returns (bool) {
        uint256 tier = tierOf(scheme);
        if (allowedCredentials.length == 0) {
            return tier == CredentialTier.GOVERNMENT_SIGNED;
        }
        for (uint256 i = 0; i < allowedCredentials.length; i++) {
            uint256 entry = allowedCredentials[i];
            if (entry == scheme || (entry < CredentialScheme.SCHEMES_PER_TIER && entry == tier)) {
                return true;
            }
        }
        return false;
    }
}
