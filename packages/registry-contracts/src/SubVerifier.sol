// SPDX-License-Identifier: Apache-2.0
// Copyright © 2025 ZKPassport
/*
 ______ _     _  _____  _______ _______ _______  _____   _____   ______ _______
  ____/ |____/  |_____] |_____| |______ |______ |_____] |     | |_____/    |
 /_____ |    \_ |       |     | ______| ______| |       |_____| |    \_    |

*/

pragma solidity ^0.8.30;

import {RootVerifier} from "./RootVerifier.sol";
import {RootRegistry} from "./RootRegistry.sol";
import {IProofVerifier} from "./IProofVerifier.sol";
import {ProofVerificationParams, NullifierType, ProofVerifier} from "./lib/Types.sol";
import {PublicInput, RegistryID} from "./lib/Constants.sol";
import {DateUtils} from "./lib/DateUtils.sol";
import {StringUtils} from "./lib/StringUtils.sol";

contract SubVerifier {
    address public admin;
    bool public paused;

    RootVerifier public rootVerifier;

    mapping(bytes32 => address) public proofVerifiers;

    event SubVerifierDeployed(address indexed admin, address indexed rootVerifier);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event ProofVerifierAdded(address indexed proofVerifier, bytes32 indexed vkeyHash);
    event ProofVerifierRemoved(address indexed proofVerifier, bytes32 indexed vkeyHash);
    event PausedStatusChanged(bool paused);

    constructor(address _admin, RootVerifier _rootVerifier) {
        require(_admin != address(0), "Admin cannot be zero address");
        admin = _admin;
        require(address(_rootVerifier) != address(0), "Root verifier cannot be zero address");
        rootVerifier = _rootVerifier;
        emit SubVerifierDeployed(admin, address(_rootVerifier));
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not authorized: admin only");
        _;
    }

    modifier onlyRootVerifier() {
        require(msg.sender == address(rootVerifier), "This function can only be called from the root verifier");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Admin cannot be zero address");
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminUpdated(oldAdmin, newAdmin);
    }

    function setPaused(bool _paused) external onlyAdmin {
        paused = _paused;
        emit PausedStatusChanged(_paused);
    }

    function addProofVerifiers(ProofVerifier[] calldata _proofVerifiers) external onlyAdmin {
        for (uint256 i = 0; i < _proofVerifiers.length; i++) {
            proofVerifiers[_proofVerifiers[i].vkeyHash] = _proofVerifiers[i].verifier;
            emit ProofVerifierAdded(_proofVerifiers[i].verifier, _proofVerifiers[i].vkeyHash);
        }
    }

    function removeProofVerifiers(bytes32[] calldata vkeyHashes) external onlyAdmin {
        for (uint256 i = 0; i < vkeyHashes.length; i++) {
            address proofVerifier = proofVerifiers[vkeyHashes[i]];
            if (proofVerifier != address(0)) {
                delete proofVerifiers[vkeyHashes[i]];
                emit ProofVerifierRemoved(proofVerifier, vkeyHashes[i]);
            }
        }
    }

    function _checkDateValidity(uint256 currentDateTimeStamp, uint256 validityPeriodInSeconds)
        internal
        view
        returns (bool)
    {
        return DateUtils.isDateValid(currentDateTimeStamp, validityPeriodInSeconds);
    }

    function _verifyScopes(bytes32[] calldata publicInputs, string calldata scope, string calldata subscope)
        internal
        pure
        returns (bool)
    {
        bytes32 scopeHash = StringUtils.isEmpty(scope) ? bytes32(0) : sha256(abi.encodePacked(scope)) >> 8;
        bytes32 subscopeHash = StringUtils.isEmpty(subscope) ? bytes32(0) : sha256(abi.encodePacked(subscope)) >> 8;
        return
            publicInputs[PublicInput.SCOPE_INDEX] == scopeHash
                && publicInputs[PublicInput.SUBSCOPE_INDEX] == subscopeHash;
    }

    function _verifyCommittedInputs(bytes32[] memory paramCommitments, bytes calldata committedInputs) internal pure {
        uint256 offset = 0;
        uint256 index = 0;
        while (offset < committedInputs.length && index < paramCommitments.length) {
            uint16 length = uint16(bytes2(committedInputs[offset + 1:offset + 3]));
            bytes32 calculatedCommitment = sha256(abi.encodePacked(committedInputs[offset:offset + length + 3])) >> 8;
            require(calculatedCommitment == paramCommitments[index], "Invalid commitment");
            offset += length + 3;
            index++;
        }
        require(offset == committedInputs.length, "Invalid committed inputs length");
        require(index == paramCommitments.length, "Invalid parameter commitments");
    }

    function _getProofVerifier(bytes32 vkeyHash) internal view returns (address) {
        address verifier = proofVerifiers[vkeyHash];
        require(verifier != address(0), "Verifier not found");
        return verifier;
    }

    function _validateCertificateRoot(RootRegistry _rootRegistry, bytes32 certificateRoot, uint256 timestamp)
        internal
        view
    {
        require(
            _rootRegistry.isRootValid(RegistryID.CERTIFICATE, certificateRoot, timestamp),
            "Invalid certificate registry root"
        );
    }

    function _validateCircuitRoot(RootRegistry _rootRegistry, bytes32 circuitRoot, uint256 timestamp) internal view {
        require(_rootRegistry.isRootValid(RegistryID.CIRCUIT, circuitRoot, timestamp), "Invalid circuit registry root");
    }

    function verify(RootRegistry rootRegistry, ProofVerificationParams calldata params)
        external
        view
        whenNotPaused
        onlyRootVerifier
        returns (bool isValid, bytes32 uniqueIdentifier)
    {
        address verifier = _getProofVerifier(params.proofVerificationData.vkeyHash);

        uint256 currentTimestamp = uint256(params.proofVerificationData.publicInputs[PublicInput.CURRENT_DATE_INDEX]);

        _validateCertificateRoot(
            rootRegistry,
            params.proofVerificationData.publicInputs[PublicInput.CERTIFICATE_REGISTRY_ROOT_INDEX],
            currentTimestamp
        );

        _validateCircuitRoot(
            rootRegistry,
            params.proofVerificationData.publicInputs[PublicInput.CIRCUIT_REGISTRY_ROOT_INDEX],
            currentTimestamp
        );

        require(
            _checkDateValidity(currentTimestamp, params.serviceConfig.validityPeriodInSeconds),
            "The proof was generated outside the validity period"
        );

        require(
            _verifyScopes(
                params.proofVerificationData.publicInputs, params.serviceConfig.domain, params.serviceConfig.scope
            ),
            "Invalid domain or scope"
        );

        _verifyCommittedInputs(
            params.proofVerificationData
            .publicInputs[PublicInput.PARAM_COMMITMENTS_INDEX:params.proofVerificationData.publicInputs.length - 2],
            params.committedInputs
        );

        NullifierType nullifierType = NullifierType(
            uint256(params.proofVerificationData.publicInputs[params.proofVerificationData.publicInputs.length - 2])
        );

        require(
            (nullifierType != NullifierType.NON_SALTED_MOCK_NULLIFIER
                    && nullifierType != NullifierType.SALTED_MOCK_NULLIFIER) || params.serviceConfig.devMode,
            "Mock proofs are only allowed in dev mode"
        );

        require(
            nullifierType == NullifierType.NON_SALTED_NULLIFIER || params.serviceConfig.devMode,
            "Salted nullifiers are not supported for now"
        );

        isValid = IProofVerifier(verifier)
            .verify(params.proofVerificationData.proof, params.proofVerificationData.publicInputs);

        uint256 uniqueIdentifierIndex = params.proofVerificationData.publicInputs.length - 1;
        uniqueIdentifier = params.proofVerificationData.publicInputs[uniqueIdentifierIndex];

        return (isValid, uniqueIdentifier);
    }
}
