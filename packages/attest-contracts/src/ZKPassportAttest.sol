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

    error ZKPassportAttest__PolicyNotFound(uint256 policyId);
    error ZKPassportAttest__PolicyAlreadyExists(uint256 policyId);
    error ZKPassportAttest__InvalidValidityPeriod();
    error ZKPassportAttest__NotPolicyOwner();
    error ZKPassportAttest__DevModeNotAllowed();
    error ZKPassportAttest__InvalidProof();
    error ZKPassportAttest__WrongScope();
    error ZKPassportAttest__StaleProof();
    error ZKPassportAttest__ProofNotBoundToWallet();
    error ZKPassportAttest__ProofNotBoundToChain();
    error ZKPassportAttest__UnexpectedBoundData();
    error ZKPassportAttest__AgeBelowMinimum();
    error ZKPassportAttest__ExcludedJurisdiction();
    error ZKPassportAttest__SybilDetected(bytes32 nullifier);
    error ZKPassportAttest__MissingNullifier();
    error ZKPassportAttest__TokenIsSoulbound();
    error ZKPassportAttest__NotRevocable();
    error ZKPassportAttest__NothingToRevoke();
    error ZKPassportAttest__Paused();
    error ZKPassportAttest__NotAuthorized();
    error ZKPassportAttest__ZeroAddress();

    event PolicyCreated(uint256 indexed policyId, address indexed owner, address hook);
    event PolicyMetadataURLUpdated(uint256 indexed policyId, string url);
    event CredentialIssued(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);
    event CredentialRenewed(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);
    event CredentialRevoked(address indexed wallet, uint256 indexed policyId, address by);
    event PausedStatusChanged(bool paused);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);

    IRootVerifier public immutable rootVerifier;
    string public domain;
    address public admin;
    address public guardian;
    bool public paused;

    uint256 public constant PROOF_FRESHNESS = 1 hours;

    mapping(uint256 policyId => Policy) internal _policies;
    mapping(address wallet => mapping(uint256 policyId => uint64)) public heldUntil;
    mapping(uint256 policyId => mapping(bytes32 nullifier => address wallet)) public nullifierWallet;
    mapping(uint256 policyId => mapping(address wallet => bytes32 nullifier)) internal _nullifierOf;

    constructor(IRootVerifier _rootVerifier, string memory _domain, address _admin, address _guardian) ERC1155("") {
        if (_admin == address(0)) revert ZKPassportAttest__ZeroAddress();
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
        if (validityPeriod == 0) revert ZKPassportAttest__InvalidValidityPeriod();
        policyId = uint256(keccak256(abi.encode(msg.sender, salt)));
        if (_policies[policyId].owner != address(0)) revert ZKPassportAttest__PolicyAlreadyExists(policyId);

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
        if (policy.owner == address(0)) revert ZKPassportAttest__PolicyNotFound(policyId);
        return policy;
    }

    /// @notice Update the display metadata URL; predicates are immutable
    function setMetadataURL(uint256 policyId, string calldata url) external {
        if (_policies[policyId].owner != msg.sender) revert ZKPassportAttest__NotPolicyOwner();
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
        if (paused) revert ZKPassportAttest__Paused();
        Policy storage policy = _policies[policyId];
        if (policy.owner == address(0)) revert ZKPassportAttest__PolicyNotFound(policyId);
        if (params.serviceConfig.devMode) revert ZKPassportAttest__DevModeNotAllowed();

        (bool valid, bytes32 nullifier, IVerifierHelper helper) = rootVerifier.verify(params);
        if (!valid) revert ZKPassportAttest__InvalidProof();

        if (!helper.verifyScopes(params.proofVerificationData.publicInputs, domain, policyScope(policyId))) {
            revert ZKPassportAttest__WrongScope();
        }
        if (helper.getProofTimestamp(params.proofVerificationData.publicInputs) + PROOF_FRESHNESS < block.timestamp) {
            revert ZKPassportAttest__StaleProof();
        }

        BoundData memory bound = helper.getBoundData(params.committedInputs);
        if (bound.senderAddress != wallet) revert ZKPassportAttest__ProofNotBoundToWallet();
        if (bound.chainId != block.chainid) revert ZKPassportAttest__ProofNotBoundToChain();
        if (bytes(bound.customData).length != 0) revert ZKPassportAttest__UnexpectedBoundData();

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
        view
    {
        if (policy.minAge > 0 && !helper.isAgeAboveOrEqual(policy.minAge, committedInputs)) {
            revert ZKPassportAttest__AgeBelowMinimum();
        }
        if (policy.excludedCountries.length > 0 && !helper.isNationalityOut(policy.excludedCountries, committedInputs))
        {
            revert ZKPassportAttest__ExcludedJurisdiction();
        }
        if (policy.sanctionsCheck) {
            helper.enforceSanctionsRoot(block.timestamp, true, committedInputs);
        }
    }

    function _consumeNullifier(Policy storage policy, uint256 policyId, bytes32 nullifier, address wallet) internal {
        if (!policy.unique) return;
        if (nullifier == bytes32(0)) revert ZKPassportAttest__MissingNullifier();
        address prior = nullifierWallet[policyId][nullifier];
        if (prior != address(0) && prior != wallet) revert ZKPassportAttest__SybilDetected(nullifier);
        nullifierWallet[policyId][nullifier] = wallet;
        _nullifierOf[policyId][wallet] = nullifier;
    }

    /// @notice 1 while the wallet holds an unexpired credential for the policy, else 0
    function balanceOf(address account, uint256 id) public view override returns (uint256) {
        return heldUntil[account][id] >= block.timestamp ? 1 : 0;
    }

    /// @notice Remove a credential; only the holder or the ZKPassport guardian, never the policy owner
    function revoke(address wallet, uint256 policyId) external {
        if (msg.sender != wallet && msg.sender != guardian) revert ZKPassportAttest__NotRevocable();
        if (heldUntil[wallet][policyId] == 0) revert ZKPassportAttest__NothingToRevoke();
        heldUntil[wallet][policyId] = 0;
        bytes32 nullifier = _nullifierOf[policyId][wallet];
        if (nullifier != bytes32(0)) {
            delete nullifierWallet[policyId][nullifier];
            delete _nullifierOf[policyId][wallet];
        }
        if (super.balanceOf(wallet, policyId) > 0) {
            _burn(wallet, policyId, 1);
        }
        emit CredentialRevoked(wallet, policyId, msg.sender);
    }

    /// @notice Emergency stop for issuance; reads and revocation stay live
    function pause() external {
        if (msg.sender != admin && msg.sender != guardian) revert ZKPassportAttest__NotAuthorized();
        paused = true;
        emit PausedStatusChanged(true);
    }

    function unpause() external {
        if (msg.sender != admin) revert ZKPassportAttest__NotAuthorized();
        paused = false;
        emit PausedStatusChanged(false);
    }

    function transferAdmin(address newAdmin) external {
        if (msg.sender != admin) revert ZKPassportAttest__NotAuthorized();
        if (newAdmin == address(0)) revert ZKPassportAttest__ZeroAddress();
        emit AdminUpdated(admin, newAdmin);
        admin = newAdmin;
    }

    function setGuardian(address newGuardian) external {
        if (msg.sender != admin) revert ZKPassportAttest__NotAuthorized();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }

    function setApprovalForAll(address, bool) public pure override {
        revert ZKPassportAttest__TokenIsSoulbound();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert ZKPassportAttest__TokenIsSoulbound();
        super._update(from, to, ids, values);
    }
}
