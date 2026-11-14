// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

// The assurance tier of a credential: tier 1 is schemes 100-199, tier 2 is 200-299
library VerificationTier {
    // The issuer signed the data
    uint256 constant GOVERNMENT_SIGNED = 1;
    // A device attested a camera read of the data, with a strict face match
    uint256 constant DEVICE_ATTESTED = 2;
}

// How the ID's data was verified: the last public input of the outer proof
library VerificationMethod {
    // The eMRTD chip, signed by the issuing country (CSCA -> DSC)
    uint256 constant ICAO_CHIP = 100;
    uint256 constant UIDAI_AADHAAR = 101;
    uint256 constant JPKI = 102;
    uint256 constant ISO_MDOC = 103;
    // The data page read by camera on iOS, attested by App Attest
    uint256 constant ATTESTED_CAPTURE_IOS = 200;
    // The data page read by camera on Android, attested by Play Integrity
    uint256 constant ATTESTED_CAPTURE_ANDROID = 201;
    // The chip read but its signature not verifiable, attested by the device; reserved, no circuit yet
    uint256 constant ATTESTED_CHIP_READ_IOS = 202;
    uint256 constant ATTESTED_CHIP_READ_ANDROID = 203;
}

library VerificationMethods {
    /// @notice The tier of a scheme, by explicit range; 0 for a value in no tier's range
    function tierOf(uint256 scheme) internal pure returns (uint256) {
        if (scheme >= 100 && scheme < 200) return VerificationTier.GOVERNMENT_SIGNED;
        if (scheme >= 200 && scheme < 300) return VerificationTier.DEVICE_ATTESTED;
        return 0;
    }

    /// @notice Whether a policy entry names a whole tier rather than one exact scheme
    function isTier(uint256 entry) internal pure returns (bool) {
        return entry == VerificationTier.GOVERNMENT_SIGNED || entry == VerificationTier.DEVICE_ATTESTED;
    }

    /**
     * @notice Whether `verify()` can accept a scheme at all: an issuer-signed one, or a device-attested
     *         one whose attestation it then checks. Which of those a service accepts is the service's
     *         choice, made with the helper's enforceVerificationMethod.
     */
    function isVerifiable(uint256 scheme) internal pure returns (bool) {
        // Only the schemes a circuit proves today, each by name: a new scheme must be added here
        // with its own checks, never accepted for falling in a tier's range
        return scheme == VerificationMethod.ICAO_CHIP || scheme == VerificationMethod.ATTESTED_CAPTURE_IOS
            || scheme == VerificationMethod.ATTESTED_CAPTURE_ANDROID;
    }

    /**
     * @notice Whether a list of accepted verification methods includes a scheme. An entry that is a
     *         tier (1 or 2) stands for every scheme of that tier; any other entry is one exact scheme. An
     *         empty list accepts tier 1 only.
     */
    function isAllowed(uint256 scheme, uint256[] memory allowedVerificationMethods) internal pure returns (bool) {
        uint256 tier = tierOf(scheme);
        if (allowedVerificationMethods.length == 0) {
            return tier == VerificationTier.GOVERNMENT_SIGNED;
        }
        for (uint256 i = 0; i < allowedVerificationMethods.length; i++) {
            uint256 entry = allowedVerificationMethods[i];
            if (entry == scheme || (isTier(entry) && entry == tier)) {
                return true;
            }
        }
        return false;
    }
}
