// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

import {AppAttest} from "./Constants.sol";
import {CredentialScheme} from "./Credentials.sol";
import {Environment, FaceMatchMode} from "./Types.sol";

/**
 * @notice The circuit takes the attestation root key as an input, so a device attested (2xx)
 *         credential is only sound if the verifier pins it, along with the app and the face match mode
 */
library AttestedId {
    function isValid(
        uint256 credentialScheme,
        bytes32 rootKeyHash,
        Environment environment,
        bytes32 appIdHash,
        bytes32 integrityPublicKeyHash,
        FaceMatchMode mode
    ) internal pure returns (bool) {
        if (environment != Environment.PRODUCTION || mode != FaceMatchMode.STRICT) {
            return false;
        }
        if (credentialScheme == CredentialScheme.ATTESTED_CAPTURE_IOS) {
            return rootKeyHash == AppAttest.APPLE_ROOT_KEY_HASH && appIdHash == AppAttest.IOS_APP_ID_HASH
                && integrityPublicKeyHash == bytes32(0);
        }
        if (credentialScheme == CredentialScheme.ATTESTED_CAPTURE_ANDROID) {
            return (rootKeyHash == AppAttest.GOOGLE_RSA_ROOT_KEY_HASH
                    || rootKeyHash == AppAttest.GOOGLE_ECDSA_ROOT_KEY_HASH)
                && appIdHash == AppAttest.ANDROID_APP_ID_HASH
                && integrityPublicKeyHash == AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH;
        }
        return false;
    }
}

/**
 * @notice A face match proof takes its attestation root key as an input, so it only shows the
 *         ZKPassport app matched the face on a genuine device if the verifier pins the root key,
 *         the app and the environment, as here for either platform
 */
library FaceMatch {
    function isGenuine(bytes32 rootKeyHash, Environment environment, bytes32 appIdHash, bytes32 integrityPublicKeyHash)
        internal
        pure
        returns (bool)
    {
        if (environment != Environment.PRODUCTION) {
            return false;
        }
        if (rootKeyHash == AppAttest.APPLE_ROOT_KEY_HASH) {
            return (appIdHash == AppAttest.IOS_APP_ID_HASH || appIdHash == AppAttest.IOS_APP_CLIP_APP_ID_HASH)
                && integrityPublicKeyHash == bytes32(0);
        }
        if (rootKeyHash == AppAttest.GOOGLE_RSA_ROOT_KEY_HASH || rootKeyHash == AppAttest.GOOGLE_ECDSA_ROOT_KEY_HASH) {
            return appIdHash == AppAttest.ANDROID_APP_ID_HASH
                && integrityPublicKeyHash == AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH;
        }
        return false;
    }
}
