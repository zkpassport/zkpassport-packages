// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {BoundData, NullifierType, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "@registry/IRootVerifier.sol";

/**
 * @title  ZKPassportCredentials
 * @notice Soulbound ERC-1155 credential registry: one tokenId per policy,
 *         balance 1 while the credential is unexpired
 */
contract ZKPassportCredentials is ERC1155 {
    struct Policy {
        address owner;
        uint64 validityPeriod;
        NullifierType uniqueIdentifierType;
        uint8 minAge;
        bool sanctionsCheck;
        string[] excludedCountries;
        string metadataURL;
        uint64 retiredAt;
    }

    error ZKPassportCredentials__PolicyNotFound(uint256 policyId);
    error ZKPassportCredentials__PolicyAlreadyExists(uint256 policyId);
    error ZKPassportCredentials__InvalidValidityPeriod();
    error ZKPassportCredentials__NotPolicyOwner();
    error ZKPassportCredentials__PolicyRetired(uint256 policyId);
    error ZKPassportCredentials__InvalidNullifierType();
    error ZKPassportCredentials__WrongNullifierType();
    error ZKPassportCredentials__DevModeNotAllowed();
    error ZKPassportCredentials__InvalidProof();
    error ZKPassportCredentials__WrongScope();
    error ZKPassportCredentials__StaleProof();
    error ZKPassportCredentials__ProofNotBoundToWallet();
    error ZKPassportCredentials__ProofNotBoundToChain();
    error ZKPassportCredentials__UnexpectedBoundData();
    error ZKPassportCredentials__AgeBelowMinimum();
    error ZKPassportCredentials__ExcludedJurisdiction();
    error ZKPassportCredentials__SybilDetected(bytes32 nullifier);
    error ZKPassportCredentials__MissingNullifier();
    error ZKPassportCredentials__TokenIsSoulbound();
    error ZKPassportCredentials__NotRevocable();
    error ZKPassportCredentials__NothingToRevoke();
    error ZKPassportCredentials__Paused();
    error ZKPassportCredentials__NotAuthorized();
    error ZKPassportCredentials__ZeroAddress();

    event PolicyCreated(uint256 indexed policyId, address indexed owner);
    event PolicyMetadataURLUpdated(uint256 indexed policyId, string url);
    event PolicyRetired(uint256 indexed policyId);
    event CredentialIssued(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);
    event CredentialRenewed(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);
    event CredentialRevoked(address indexed wallet, uint256 indexed policyId, address by);
    event PausedStatusChanged(bool paused);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);

    IRootVerifier public immutable rootVerifier;
    string public domain;
    address public admin;
    bool public paused;

    uint256 public constant PROOF_FRESHNESS = 1 hours;

    mapping(uint256 policyId => Policy) internal _policies;
    mapping(address wallet => mapping(uint256 policyId => uint64)) public heldUntil;
    mapping(uint256 policyId => mapping(bytes32 nullifier => address wallet)) public nullifierWallet;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert ZKPassportCredentials__NotAuthorized();
        _;
    }

    modifier onlyPolicyOwner(uint256 policyId) {
        if (_policies[policyId].owner != msg.sender) revert ZKPassportCredentials__NotPolicyOwner();
        _;
    }

    modifier onlyHolderOrPolicyOwner(address wallet, uint256 policyId) {
        if (msg.sender != wallet && msg.sender != _policies[policyId].owner) {
            revert ZKPassportCredentials__NotRevocable();
        }
        _;
    }

    constructor(IRootVerifier _rootVerifier, string memory _domain, address _admin) ERC1155("") {
        if (_admin == address(0)) revert ZKPassportCredentials__ZeroAddress();
        rootVerifier = _rootVerifier;
        domain = _domain;
        admin = _admin;
    }

    /// @notice Create a policy; the id is namespaced by creator and salt and stable across chains.
    ///         uniqueIdentifierType NONE_NULLIFIER means no one-per-document dedup; NON_SALTED_NULLIFIER
    ///         and SALTED_NULLIFIER demand exactly that nullifier type from every proof and dedup on it.
    function createPolicy(
        bytes32 salt,
        uint64 validityPeriod,
        NullifierType uniqueIdentifierType,
        uint8 minAge,
        bool sanctionsCheck,
        string[] calldata excludedCountries,
        string calldata metadataURL
    ) external returns (uint256 policyId) {
        if (validityPeriod == 0) revert ZKPassportCredentials__InvalidValidityPeriod();
        if (
            uniqueIdentifierType != NullifierType.NONE_NULLIFIER
                && uniqueIdentifierType != NullifierType.NON_SALTED_NULLIFIER
                && uniqueIdentifierType != NullifierType.SALTED_NULLIFIER
        ) revert ZKPassportCredentials__InvalidNullifierType();

        policyId = uint256(keccak256(abi.encode(msg.sender, salt)));
        if (_policies[policyId].owner != address(0)) revert ZKPassportCredentials__PolicyAlreadyExists(policyId);

        Policy storage policy = _policies[policyId];
        policy.owner = msg.sender;
        policy.validityPeriod = validityPeriod;
        policy.uniqueIdentifierType = uniqueIdentifierType;
        policy.minAge = minAge;
        policy.sanctionsCheck = sanctionsCheck;
        for (uint256 i = 0; i < excludedCountries.length; i++) {
            policy.excludedCountries.push(excludedCountries[i]);
        }
        policy.metadataURL = metadataURL;

        emit PolicyCreated(policyId, msg.sender);
    }

    /// @notice Full policy struct; reverts for unknown ids
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        Policy memory policy = _policies[policyId];
        if (policy.owner == address(0)) revert ZKPassportCredentials__PolicyNotFound(policyId);
        return policy;
    }

    /// @notice Update the display metadata URL; predicates are immutable
    function setMetadataURL(uint256 policyId, string calldata url) external onlyPolicyOwner(policyId) {
        _policies[policyId].metadataURL = url;
        emit PolicyMetadataURLUpdated(policyId, url);
    }

    /// @notice Permanently stop new issuance and renewals for a policy; existing
    ///         credentials stay valid until they expire, so gates reading balanceOf degrade gracefully
    function retire(uint256 policyId) external onlyPolicyOwner(policyId) {
        Policy storage policy = _policies[policyId];
        if (policy.retiredAt != 0) revert ZKPassportCredentials__PolicyRetired(policyId);
        policy.retiredAt = uint64(block.timestamp);
        emit PolicyRetired(policyId);
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
        if (paused) revert ZKPassportCredentials__Paused();

        Policy storage policy = _policies[policyId];
        if (policy.owner == address(0)) revert ZKPassportCredentials__PolicyNotFound(policyId);
        if (policy.retiredAt != 0) revert ZKPassportCredentials__PolicyRetired(policyId);

        if (params.serviceConfig.devMode) revert ZKPassportCredentials__DevModeNotAllowed();

        (bool valid, bytes32 nullifier, IVerifierHelper helper) = rootVerifier.verify(params);
        if (!valid) revert ZKPassportCredentials__InvalidProof();

        if (!helper.verifyScopes(params.proofVerificationData.publicInputs, domain, policyScope(policyId))) {
            revert ZKPassportCredentials__WrongScope();
        }

        if (helper.getProofTimestamp(params.proofVerificationData.publicInputs) + PROOF_FRESHNESS < block.timestamp) {
            revert ZKPassportCredentials__StaleProof();
        }

        BoundData memory bound = helper.getBoundData(params.committedInputs);
        if (bound.senderAddress != wallet) revert ZKPassportCredentials__ProofNotBoundToWallet();
        if (bound.chainId != block.chainid) revert ZKPassportCredentials__ProofNotBoundToChain();
        if (bytes(bound.customData).length != 0) revert ZKPassportCredentials__UnexpectedBoundData();

        if (policy.uniqueIdentifierType != NullifierType.NONE_NULLIFIER) {
            bytes32[] calldata publicInputs = params.proofVerificationData.publicInputs;
            NullifierType nullifierType = NullifierType(uint256(publicInputs[publicInputs.length - 3]));
            if (nullifierType != policy.uniqueIdentifierType) revert ZKPassportCredentials__WrongNullifierType();
        }

        _enforcePredicates(policy, helper, params.committedInputs);
        _consumeNullifier(policy, policyId, nullifier, wallet);

        bool firstIssue = heldUntil[wallet][policyId] == 0;
        uint64 newHeldUntil = uint64(block.timestamp + policy.validityPeriod);
        heldUntil[wallet][policyId] = newHeldUntil;

        if (super.balanceOf(wallet, policyId) == 0) {
            // _update instead of _mint: the soulbound token is granted by proof, not
            // transferred, so the ERC-1155 receiver acceptance check would only stop
            // contract wallets without onERC1155Received from ever holding a credential.
            uint256[] memory ids = new uint256[](1);
            ids[0] = policyId;
            uint256[] memory values = new uint256[](1);
            values[0] = 1;
            _update(address(0), wallet, ids, values);
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
            revert ZKPassportCredentials__AgeBelowMinimum();
        }
        if (policy.excludedCountries.length > 0 && !helper.isNationalityOut(policy.excludedCountries, committedInputs))
        {
            revert ZKPassportCredentials__ExcludedJurisdiction();
        }
        if (policy.sanctionsCheck) {
            helper.enforceSanctionsRoot(block.timestamp, true, committedInputs);
        }
    }

    function _consumeNullifier(Policy storage policy, uint256 policyId, bytes32 nullifier, address wallet) internal {
        if (policy.uniqueIdentifierType == NullifierType.NONE_NULLIFIER) return;
        if (nullifier == bytes32(0)) revert ZKPassportCredentials__MissingNullifier();
        address prior = nullifierWallet[policyId][nullifier];
        if (prior != address(0) && prior != wallet) revert ZKPassportCredentials__SybilDetected(nullifier);
        nullifierWallet[policyId][nullifier] = wallet;
    }

    /// @notice 1 while the wallet holds an unexpired credential for the policy, else 0
    function balanceOf(address account, uint256 id) public view override returns (uint256) {
        return heldUntil[account][id] >= block.timestamp ? 1 : 0;
    }

    /// @notice Remove a credential; only the holder or the policy owner.
    ///         Policy-owner revocation is targeted incident response (court order, wrongly
    ///         issued credential) — sanctions propagation does NOT happen here: it is enforced at
    ///         issuance/renewal against the current sanctions root, bounded by the policy's
    ///         validityPeriod, with no per-address enumeration.
    ///         The nullifier stays bound to the wallet: releasing it would let a holder revoke and
    ///         re-issue to a fresh wallet, timing repeated access to a one-per-document gate. The
    ///         document can only ever re-credential the same wallet for this policy.
    function revoke(address wallet, uint256 policyId) external onlyHolderOrPolicyOwner(wallet, policyId) {
        if (heldUntil[wallet][policyId] == 0) revert ZKPassportCredentials__NothingToRevoke();

        heldUntil[wallet][policyId] = 0;

        if (super.balanceOf(wallet, policyId) > 0) {
            _burn(wallet, policyId, 1);
        }

        emit CredentialRevoked(wallet, policyId, msg.sender);
    }

    /// @notice Emergency stop for issuance; reads and revocation stay live
    function pause() external onlyAdmin {
        paused = true;
        emit PausedStatusChanged(true);
    }

    function unpause() external onlyAdmin {
        paused = false;
        emit PausedStatusChanged(false);
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZKPassportCredentials__ZeroAddress();
        emit AdminUpdated(admin, newAdmin);
        admin = newAdmin;
    }

    function setApprovalForAll(address, bool) public pure override {
        revert ZKPassportCredentials__TokenIsSoulbound();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert ZKPassportCredentials__TokenIsSoulbound();
        super._update(from, to, ids, values);
    }
}
