// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

import {RootRegistry} from "./RootRegistry.sol";
import {DateUtils} from "./lib/DateUtils.sol";
import {StringUtils} from "./lib/StringUtils.sol";
import {InputsExtractor} from "./lib/InputsExtractor.sol";
import {SECONDS_BETWEEN_1900_AND_1970, PublicInput, AppAttest, RegistryID} from "./lib/Constants.sol";
import {ProofType, DisclosedData, BoundData, FaceMatchMode, Environment, OS} from "./lib/Types.sol";

contract VerifierHelper {
    RootRegistry public immutable rootRegistry;

    constructor(RootRegistry _rootRegistry) {
        require(address(_rootRegistry) != address(0), "Root registry cannot be zero address");
        rootRegistry = _rootRegistry;
    }

    function getDisclosedData(bytes calldata committedInputs, bool isIDCard)
        external
        pure
        returns (DisclosedData memory disclosedData)
    {
        (, bytes memory discloseBytes) = InputsExtractor.getDiscloseProofInputs(committedInputs);
        disclosedData = InputsExtractor.getDisclosedData(discloseBytes, isIDCard);
    }

    function isAgeAboveOrEqual(uint8 minAge, bytes calldata committedInputs) public pure returns (bool) {
        (uint8 min, uint8 max) = InputsExtractor.getAgeProofInputs(committedInputs);
        require(max == 0, "The proof upper bound must be 0, please use isAgeBetween instead");
        return minAge == min;
    }

    function isAgeAbove(uint8 minAge, bytes calldata committedInputs) public pure returns (bool) {
        return isAgeAboveOrEqual(minAge + 1, committedInputs);
    }

    function isAgeBetween(uint8 minAge, uint8 maxAge, bytes calldata committedInputs) public pure returns (bool) {
        (uint8 min, uint8 max) = InputsExtractor.getAgeProofInputs(committedInputs);
        require(minAge <= maxAge, "Min age must be less than or equal to max age");
        require(min != 0, "The proof lower bound must be non-zero, please use isAgeBelowOrEqual instead");
        require(max != 0, "The proof upper bound must be non-zero, please use isAgeAboveOrEqual instead");
        return minAge == min && maxAge == max;
    }

    function isAgeBelowOrEqual(uint8 maxAge, bytes calldata committedInputs) public pure returns (bool) {
        (uint8 min, uint8 max) = InputsExtractor.getAgeProofInputs(committedInputs);
        require(min == 0, "The proof lower bound must be 0, please use isAgeBetween instead");
        return maxAge == max;
    }

    function isAgeBelow(uint8 maxAge, bytes calldata committedInputs) public pure returns (bool) {
        require(maxAge > 0, "Max age must be greater than 0");
        return isAgeBelowOrEqual(maxAge - 1, committedInputs);
    }

    function isAgeEqual(uint8 age, bytes calldata committedInputs) public pure returns (bool) {
        return isAgeBetween(age, age, committedInputs);
    }

    function _isDateAfterOrEqual(uint256 minDate, ProofType proofType, bytes calldata committedInputs)
        private
        pure
        returns (bool)
    {
        (uint256 min, uint256 max) = InputsExtractor.getDateProofInputs(committedInputs, proofType);
        require(proofType == ProofType.BIRTHDATE || proofType == ProofType.EXPIRY_DATE, "Invalid proof type");
        if (proofType == ProofType.BIRTHDATE) {
            require(max == 0, "The proof upper bound must be 0, please use isBirthdateBetween instead");
            return minDate == min - SECONDS_BETWEEN_1900_AND_1970;
        } else {
            require(max == 0, "The proof upper bound must be 0, please use isExpiryDateBetween instead");
            return minDate == min;
        }
    }

    function _isDateBetween(uint256 minDate, uint256 maxDate, ProofType proofType, bytes calldata committedInputs)
        private
        pure
        returns (bool)
    {
        (uint256 min, uint256 max) = InputsExtractor.getDateProofInputs(committedInputs, proofType);
        require(minDate <= maxDate, "Min date must be less than or equal to max date");
        require(proofType == ProofType.BIRTHDATE || proofType == ProofType.EXPIRY_DATE, "Invalid proof type");
        if (proofType == ProofType.BIRTHDATE) {
            require(min != 0, "The proof lower bound must be non-zero, please use isBirthdateBelowOrEqual instead");
            require(max != 0, "The proof upper bound must be non-zero, please use isBirthdateAboveOrEqual instead");
            return minDate == min - SECONDS_BETWEEN_1900_AND_1970 && maxDate == max - SECONDS_BETWEEN_1900_AND_1970;
        } else {
            require(min != 0, "The proof lower bound must be non-zero, please use isExpiryDateBelowOrEqual instead");
            require(max != 0, "The proof upper bound must be non-zero, please use isExpiryDateAboveOrEqual instead");
            return minDate == min && maxDate == max;
        }
    }

    function _isDateBeforeOrEqual(uint256 maxDate, ProofType proofType, bytes calldata committedInputs)
        private
        pure
        returns (bool)
    {
        (uint256 min, uint256 max) = InputsExtractor.getDateProofInputs(committedInputs, proofType);
        require(min == 0, "The proof lower bound must be 0, please use _isDateBetween instead");
        require(proofType == ProofType.BIRTHDATE || proofType == ProofType.EXPIRY_DATE, "Invalid proof type");
        if (proofType == ProofType.BIRTHDATE) {
            require(max != 0, "The proof upper bound must be non-zero, please use isBirthdateAboveOrEqual instead");
            return maxDate == max - SECONDS_BETWEEN_1900_AND_1970;
        } else {
            require(max != 0, "The proof upper bound must be non-zero, please use isExpiryDateAboveOrEqual instead");
            return maxDate == max;
        }
    }

    function isBirthdateAfterOrEqual(uint256 minDate, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateAfterOrEqual(minDate, ProofType.BIRTHDATE, committedInputs);
    }

    function isBirthdateAfter(uint256 minDate, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateAfterOrEqual(minDate + 1 days, ProofType.BIRTHDATE, committedInputs);
    }

    function isBirthdateBetween(uint256 minDate, uint256 maxDate, bytes calldata committedInputs)
        public
        pure
        returns (bool)
    {
        return _isDateBetween(minDate, maxDate, ProofType.BIRTHDATE, committedInputs);
    }

    function isBirthdateBeforeOrEqual(uint256 maxDate, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateBeforeOrEqual(maxDate, ProofType.BIRTHDATE, committedInputs);
    }

    function isBirthdateBefore(uint256 maxDate, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateBeforeOrEqual(maxDate - 1 days, ProofType.BIRTHDATE, committedInputs);
    }

    function isBirthdateEqual(uint256 date, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateBetween(date, date, ProofType.BIRTHDATE, committedInputs);
    }

    function isExpiryDateAfterOrEqual(uint256 minDate, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateAfterOrEqual(minDate, ProofType.EXPIRY_DATE, committedInputs);
    }

    function isExpiryDateAfter(uint256 minDate, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateAfterOrEqual(minDate + 1 days, ProofType.EXPIRY_DATE, committedInputs);
    }

    function isExpiryDateBetween(uint256 minDate, uint256 maxDate, bytes calldata committedInputs)
        public
        pure
        returns (bool)
    {
        return _isDateBetween(minDate, maxDate, ProofType.EXPIRY_DATE, committedInputs);
    }

    function isExpiryDateBeforeOrEqual(uint256 maxDate, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateBeforeOrEqual(maxDate, ProofType.EXPIRY_DATE, committedInputs);
    }

    function isExpiryDateBefore(uint256 maxDate, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateBeforeOrEqual(maxDate - 1 days, ProofType.EXPIRY_DATE, committedInputs);
    }

    function isExpiryDateEqual(uint256 date, bytes calldata committedInputs) public pure returns (bool) {
        return _isDateBetween(date, date, ProofType.EXPIRY_DATE, committedInputs);
    }

    function isCountryInOrOut(string[] memory countryList, ProofType proofType, bytes calldata committedInputs)
        private
        pure
        returns (bool)
    {
        (string[] memory inputCountryList, uint256 inputCountryListLength) =
            InputsExtractor.getCountryProofInputs(committedInputs, proofType);
        if (countryList.length != inputCountryListLength) {
            return false;
        }
        for (uint256 i = 0; i < inputCountryListLength; i++) {
            if (!StringUtils.equals(countryList[i], inputCountryList[i])) {
                return false;
            }
        }
        return true;
    }

    function isNationalityIn(string[] memory countryList, bytes calldata committedInputs) external pure returns (bool) {
        return isCountryInOrOut(countryList, ProofType.NATIONALITY_INCLUSION, committedInputs);
    }

    function isIssuingCountryIn(string[] memory countryList, bytes calldata committedInputs)
        external
        pure
        returns (bool)
    {
        return isCountryInOrOut(countryList, ProofType.ISSUING_COUNTRY_INCLUSION, committedInputs);
    }

    function isNationalityOut(string[] memory countryList, bytes calldata committedInputs)
        external
        pure
        returns (bool)
    {
        return isCountryInOrOut(countryList, ProofType.NATIONALITY_EXCLUSION, committedInputs);
    }

    function isIssuingCountryOut(string[] memory countryList, bytes calldata committedInputs)
        external
        pure
        returns (bool)
    {
        return isCountryInOrOut(countryList, ProofType.ISSUING_COUNTRY_EXCLUSION, committedInputs);
    }

    function getBoundData(bytes calldata committedInputs) external pure returns (BoundData memory boundData) {
        bytes memory data = InputsExtractor.getBindProofInputs(committedInputs);
        (boundData.senderAddress, boundData.chainId, boundData.customData) = InputsExtractor.getBoundData(data);
    }

    function isSanctionsRootValid(uint256 currentTimestamp, bool isStrict, bytes calldata committedInputs)
        external
        view
        returns (bool)
    {
        return _isSanctionsRootValid(currentTimestamp, isStrict, committedInputs);
    }

    function _isSanctionsRootValid(uint256 currentTimestamp, bool isStrict, bytes calldata committedInputs)
        internal
        view
        returns (bool)
    {
        (bytes32 proofSanctionsRoot, bool retrievedIsStrict) = InputsExtractor.getSanctionsProofInputs(committedInputs);
        require(isStrict == retrievedIsStrict, "Invalid sanctions check mode");
        return rootRegistry.isRootValid(RegistryID.SANCTIONS, proofSanctionsRoot, currentTimestamp);
    }

    function enforceSanctionsRoot(uint256 currentTimestamp, bool isStrict, bytes calldata committedInputs)
        external
        view
    {
        bool isValid = _isSanctionsRootValid(currentTimestamp, isStrict, committedInputs);
        require(isValid, "Invalid sanctions registry root");
    }

    function isFaceMatchVerified(FaceMatchMode faceMatchMode, OS os, bytes calldata committedInputs)
        external
        pure
        returns (bool)
    {
        (
            bytes32 rootKeyHash,
            Environment environment,
            bytes32 appIdHash,
            bytes32 integrityPublicKeyHash,
            FaceMatchMode retrievedFaceMatchMode
        ) = InputsExtractor.getFacematchProofInputs(committedInputs);
        bool isProduction = environment == Environment.PRODUCTION;
        bool isCorrectMode = retrievedFaceMatchMode == faceMatchMode;
        bool isCorrectRootKeyHash = (rootKeyHash == AppAttest.APPLE_ROOT_KEY_HASH && (os == OS.IOS || os == OS.ANY))
            || (rootKeyHash == AppAttest.GOOGLE_RSA_ROOT_KEY_HASH && (os == OS.ANDROID || os == OS.ANY));
        bool isCorrectAppIdHash = (appIdHash == AppAttest.IOS_APP_ID_HASH && (os == OS.IOS || os == OS.ANY))
            || (appIdHash == AppAttest.ANDROID_APP_ID_HASH && (os == OS.ANDROID || os == OS.ANY));
        bool isCorrectIntegrityPublicKeyHash = (integrityPublicKeyHash == bytes32(0) && (os == OS.IOS || os == OS.ANY))
            || (integrityPublicKeyHash == AppAttest.ANDROID_INTEGRITY_PUBLIC_KEY_HASH
                && (os == OS.ANDROID || os == OS.ANY));
        return
            isProduction && isCorrectMode && isCorrectRootKeyHash && isCorrectAppIdHash
                && isCorrectIntegrityPublicKeyHash;
    }

    function getProofTimestamp(bytes32[] calldata publicInputs) external pure returns (uint256) {
        return uint256(publicInputs[PublicInput.CURRENT_DATE_INDEX]);
    }

    function verifyScopes(bytes32[] calldata publicInputs, string calldata scope, string calldata subscope)
        external
        pure
        returns (bool)
    {
        bytes32 scopeHash = StringUtils.isEmpty(scope) ? bytes32(0) : sha256(abi.encodePacked(scope)) >> 8;
        bytes32 subscopeHash = StringUtils.isEmpty(subscope) ? bytes32(0) : sha256(abi.encodePacked(subscope)) >> 8;
        return
            publicInputs[PublicInput.SCOPE_INDEX] == scopeHash
                && publicInputs[PublicInput.SUBSCOPE_INDEX] == subscopeHash;
    }
}
