// SPDX-License-Identifier: Apache-2.0
// Copyright © 2026 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

uint256 constant SECONDS_BETWEEN_1900_AND_1970 = 2208988800;
uint256 constant COUNTRY_LIST_LENGTH = 200;
uint256 constant BOUND_DATA_LENGTH = 509;
uint256 constant TIMESTAMP_LENGTH = 8;

library RegistryID {
    bytes32 constant CERTIFICATE = bytes32(0x0000000000000000000000000000000000000000000000000000000000000001);
    bytes32 constant CIRCUIT = bytes32(0x0000000000000000000000000000000000000000000000000000000000000002);
    bytes32 constant SANCTIONS = bytes32(0x0000000000000000000000000000000000000000000000000000000000000003);
}

library CommittedInputLen {
    uint256 constant COMPARE_AGE = 2;
    uint256 constant COMPARE_BIRTHDATE = 16;
    uint256 constant COMPARE_EXPIRY = 16;
    uint256 constant DISCLOSE_BYTES = 180;
    uint256 constant INCL_ISSUING_COUNTRY = 600;
    uint256 constant EXCL_ISSUING_COUNTRY = 600;
    uint256 constant INCL_NATIONALITY = 600;
    uint256 constant EXCL_NATIONALITY = 600;
    uint256 constant BIND = 509;
    uint256 constant SANCTIONS = 33;
    uint256 constant FACEMATCH = 98;
}

library PublicInput {
    uint256 constant CERTIFICATE_REGISTRY_ROOT_INDEX = 0;
    uint256 constant CIRCUIT_REGISTRY_ROOT_INDEX = 1;
    uint256 constant CURRENT_DATE_INDEX = 2;
    uint256 constant SCOPE_INDEX = 3;
    uint256 constant SUBSCOPE_INDEX = 4;
    uint256 constant PARAM_COMMITMENTS_INDEX = 5;
    uint256 constant PUBLIC_INPUTS_EXCLUDING_PARAM_COMMITMENTS_LENGTH = 7;
}

library MRZIndex {
    uint256 constant PASSPORT_MRZ_ISSUING_COUNTRY_INDEX = 2;
    uint256 constant PASSPORT_MRZ_NATIONALITY_INDEX = 54;
    uint256 constant PASSPORT_MRZ_GENDER_INDEX = 64;
    uint256 constant PASSPORT_MRZ_EXPIRY_DATE_INDEX = 65;
    uint256 constant PASSPORT_MRZ_BIRTHDATE_INDEX = 57;
    uint256 constant PASSPORT_MRZ_DOCUMENT_NUMBER_INDEX = 44;
    uint256 constant PASSPORT_MRZ_DOCUMENT_TYPE_INDEX = 0;
    uint256 constant PASSPORT_MRZ_NAME_INDEX = 5;

    uint256 constant ID_CARD_MRZ_ISSUING_COUNTRY_INDEX = 2;
    uint256 constant ID_CARD_MRZ_NATIONALITY_INDEX = 45;
    uint256 constant ID_CARD_MRZ_GENDER_INDEX = 37;
    uint256 constant ID_CARD_MRZ_EXPIRY_DATE_INDEX = 38;
    uint256 constant ID_CARD_MRZ_BIRTHDATE_INDEX = 30;
    uint256 constant ID_CARD_MRZ_DOCUMENT_NUMBER_INDEX = 5;
    uint256 constant ID_CARD_MRZ_DOCUMENT_TYPE_INDEX = 0;
    uint256 constant ID_CARD_MRZ_NAME_INDEX = 60;
}

library MRZLength {
    uint256 constant PASSPORT_MRZ_LENGTH = 88;
    uint256 constant ID_CARD_MRZ_LENGTH = 90;
    uint256 constant MRZ_MAX_LENGTH = 90;
    uint256 constant PASSPORT_MRZ_ISSUING_COUNTRY_LENGTH = 3;
    uint256 constant ID_CARD_MRZ_ISSUING_COUNTRY_LENGTH = 3;
    uint256 constant PASSPORT_MRZ_NATIONALITY_LENGTH = 3;
    uint256 constant ID_CARD_MRZ_NATIONALITY_LENGTH = 3;
    uint256 constant PASSPORT_MRZ_GENDER_LENGTH = 1;
    uint256 constant ID_CARD_MRZ_GENDER_LENGTH = 1;
    uint256 constant PASSPORT_MRZ_BIRTHDATE_LENGTH = 6;
    uint256 constant ID_CARD_MRZ_BIRTHDATE_LENGTH = 6;
    uint256 constant PASSPORT_MRZ_EXPIRY_DATE_LENGTH = 6;
    uint256 constant ID_CARD_MRZ_EXPIRY_DATE_LENGTH = 6;
    uint256 constant PASSPORT_MRZ_DOCUMENT_NUMBER_LENGTH = 9;
    uint256 constant ID_CARD_MRZ_DOCUMENT_NUMBER_LENGTH = 9;
    uint256 constant PASSPORT_MRZ_DOCUMENT_TYPE_LENGTH = 2;
    uint256 constant ID_CARD_MRZ_DOCUMENT_TYPE_LENGTH = 2;
    uint256 constant PASSPORT_MRZ_NAME_LENGTH = 39;
    uint256 constant ID_CARD_MRZ_NAME_LENGTH = 30;
    uint256 constant PASSPORT_MRZ_YEAR_OF_BIRTH_LENGTH = 2;
    uint256 constant ID_CARD_MRZ_YEAR_OF_BIRTH_LENGTH = 2;
}

library AppAttest {
    bytes32 constant IOS_APP_ID_HASH = 0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b;
    bytes32 constant ANDROID_APP_ID_HASH = 0x24d9929b248be7eeecaa98e105c034a50539610f3fdd4cb9c8983ef4100d615d;
    bytes32 constant APPLE_ROOT_KEY_HASH = 0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b;
    bytes32 constant GOOGLE_RSA_ROOT_KEY_HASH = 0x16700a2d9168a194fc85f237af5829b5a2be05b8ae8ac4879ada34cf54a9c211;
    bytes32 constant ANDROID_INTEGRITY_PUBLIC_KEY_HASH = 0x12e3dc7cc8fec0205b51ff21825630865028f3be5bc64a6eec9ee5e71221319f;
}
