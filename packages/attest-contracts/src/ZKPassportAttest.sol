// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "./interfaces/IRootVerifier.sol";
import {PolicyValidationHook} from "./PolicyValidationHook.sol";

/**
 * @title  ZKPassportAttest
 * @notice Soulbound ERC-1155 credential registry: one tokenId per policy,
 *         balance 1 while the credential is unexpired
 */
contract ZKPassportAttest is ERC1155 {
    struct Policy {
        address owner;
        uint64 validityPeriod;
        bool unique;
        uint8 minAge;
        bool sanctionsCheck;
        string[] excludedCountries;
        string metadataURL;
        address hook;
    }

    error Attest__PolicyNotFound(uint256 policyId);
    error Attest__PolicyAlreadyExists(uint256 policyId);
    error Attest__InvalidValidityPeriod();
    error Attest__NotPolicyOwner();
    error Attest__DevModeNotAllowed();
    error Attest__InvalidProof();
    error Attest__WrongScope();
    error Attest__StaleProof();
    error Attest__ProofNotBoundToWallet();
    error Attest__ProofNotBoundToChain();
    error Attest__UnexpectedBoundData();

    event PolicyCreated(uint256 indexed policyId, address indexed owner, address hook);
    event PolicyMetadataURLUpdated(uint256 indexed policyId, string url);
    event CredentialIssued(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);
    event CredentialRenewed(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);

    IRootVerifier public immutable rootVerifier;
    string public domain;
    address public admin;
    address public guardian;

    uint256 public constant PROOF_FRESHNESS = 1 hours;

    mapping(uint256 policyId => Policy) internal _policies;
    mapping(address wallet => mapping(uint256 policyId => uint64)) public heldUntil;

    constructor(IRootVerifier _rootVerifier, string memory _domain, address _admin, address _guardian) ERC1155("") {
        rootVerifier = _rootVerifier;
        domain = _domain;
        admin = _admin;
        guardian = _guardian;
    }

    /// @notice Create a policy; the id is namespaced by creator and salt and stable across chains
    function createPolicy(
        bytes32 salt,
        uint64 validityPeriod,
        bool unique,
        uint8 minAge,
        bool sanctionsCheck,
        string[] calldata excludedCountries,
        string calldata metadataURL
    ) external returns (uint256 policyId) {
        if (validityPeriod == 0) revert Attest__InvalidValidityPeriod();
        policyId = uint256(keccak256(abi.encode(msg.sender, salt)));
        if (_policies[policyId].owner != address(0)) revert Attest__PolicyAlreadyExists(policyId);

        address hook = address(new PolicyValidationHook{salt: bytes32(policyId)}(IERC1155(address(this)), policyId));

        Policy storage policy = _policies[policyId];
        policy.owner = msg.sender;
        policy.validityPeriod = validityPeriod;
        policy.unique = unique;
        policy.minAge = minAge;
        policy.sanctionsCheck = sanctionsCheck;
        for (uint256 i = 0; i < excludedCountries.length; i++) {
            policy.excludedCountries.push(excludedCountries[i]);
        }
        policy.metadataURL = metadataURL;
        policy.hook = hook;

        emit PolicyCreated(policyId, msg.sender, hook);
    }

    /// @notice Full policy struct; reverts for unknown ids
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        Policy memory policy = _policies[policyId];
        if (policy.owner == address(0)) revert Attest__PolicyNotFound(policyId);
        return policy;
    }

    /// @notice Update the display metadata URL; predicates are immutable
    function setMetadataURL(uint256 policyId, string calldata url) external {
        if (_policies[policyId].owner != msg.sender) revert Attest__NotPolicyOwner();
        _policies[policyId].metadataURL = url;
        emit PolicyMetadataURLUpdated(policyId, url);
    }

    function uri(uint256 policyId) public view override returns (string memory) {
        return _policies[policyId].metadataURL;
    }

    /// @notice The proof subscope a credential for this policy must be generated with
    function policyScope(uint256 policyId) public pure returns (string memory) {
        return string.concat("attest:", Strings.toHexString(policyId, 32));
    }

    /// @notice Verify a proof and grant (or extend) the wallet's credential for a policy.
    ///         Anyone may pay the gas; the proof itself pins the recipient wallet and chain.
    function issue(address wallet, uint256 policyId, ProofVerificationParams calldata params) external {
        Policy storage policy = _policies[policyId];
        if (policy.owner == address(0)) revert Attest__PolicyNotFound(policyId);
        if (params.serviceConfig.devMode) revert Attest__DevModeNotAllowed();

        (bool valid, bytes32 nullifier, IVerifierHelper helper) = rootVerifier.verify(params);
        if (!valid) revert Attest__InvalidProof();

        if (!helper.verifyScopes(params.proofVerificationData.publicInputs, domain, policyScope(policyId))) {
            revert Attest__WrongScope();
        }
        if (helper.getProofTimestamp(params.proofVerificationData.publicInputs) + PROOF_FRESHNESS < block.timestamp) {
            revert Attest__StaleProof();
        }

        BoundData memory bound = helper.getBoundData(params.committedInputs);
        if (bound.senderAddress != wallet) revert Attest__ProofNotBoundToWallet();
        if (bound.chainId != block.chainid) revert Attest__ProofNotBoundToChain();
        if (bytes(bound.customData).length != 0) revert Attest__UnexpectedBoundData();

        _enforcePredicates(policy, helper, params.committedInputs);
        _consumeNullifier(policy, policyId, nullifier, wallet);

        bool firstIssue = heldUntil[wallet][policyId] == 0;
        uint64 newHeldUntil = uint64(block.timestamp + policy.validityPeriod);
        heldUntil[wallet][policyId] = newHeldUntil;
        if (super.balanceOf(wallet, policyId) == 0) {
            _mint(wallet, policyId, 1, "");
        }
        if (firstIssue) {
            emit CredentialIssued(wallet, policyId, newHeldUntil);
        } else {
            emit CredentialRenewed(wallet, policyId, newHeldUntil);
        }
    }

    function _enforcePredicates(Policy storage policy, IVerifierHelper helper, bytes calldata committedInputs)
        internal
        view {}

    function _consumeNullifier(Policy storage policy, uint256 policyId, bytes32 nullifier, address wallet) internal {}
}
