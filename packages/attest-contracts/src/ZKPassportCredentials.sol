// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {PolicyEvaluationResult, IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @title  ZKPassportCredentials
 * @notice Soulbound ERC-1155 credential ledger: one tokenId per policy (where tokenId=policyId).
 *         Proof verification, policy interpretation, and issuance judgment are delegated to an
 *         `IPolicyEvaluator` pinned to each policy at creation.
 */
contract ZKPassportCredentials is ERC1155 {
    struct Policy {
        address owner;
        uint64 credentialDuration;
        bool ownerIssuable;
        bool ownerBannable;
        bool ownerEditable;
        address evaluator;
        bytes requirements;
        string metadataURL;
        uint64 retiredAt;
    }

    error ZKPassportCredentials__PolicyNotFound(uint256 policyId);
    error ZKPassportCredentials__PolicyAlreadyExists(uint256 policyId);
    error ZKPassportCredentials__InvalidCredentialDuration();
    error ZKPassportCredentials__NotPolicyOwner();
    error ZKPassportCredentials__PolicyRetired(uint256 policyId);
    error ZKPassportCredentials__SybilDetected(bytes32 nullifier);
    error ZKPassportCredentials__MissingNullifier();
    error ZKPassportCredentials__TokenIsSoulbound();
    error ZKPassportCredentials__NotBannable();
    error ZKPassportCredentials__NothingToRenounce();
    error ZKPassportCredentials__Paused();
    error ZKPassportCredentials__NotIssuableByOwner();
    error ZKPassportCredentials__NotEditable();
    error ZKPassportCredentials__WalletBanned();
    error ZKPassportCredentials__NotBanned();
    error ZKPassportCredentials__NotAuthorized();
    error ZKPassportCredentials__ZeroAddress();

    event PolicyCreated(uint256 indexed policyId, address indexed owner);
    event PolicyMetadataURLUpdated(uint256 indexed policyId, string url);
    event PolicyRequirementsChanged(uint256 indexed policyId);
    event PolicyRetired(uint256 indexed policyId);
    event CredentialIssued(address indexed wallet, uint256 indexed policyId, uint64 heldUntil, string customData);
    event CredentialRenewed(address indexed wallet, uint256 indexed policyId, uint64 heldUntil, string customData);
    event CredentialRenounced(address indexed wallet, uint256 indexed policyId);
    event PausedStatusChanged(bool paused);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event PolicyEvaluatorUpdated(address indexed oldEvaluator, address indexed newEvaluator);
    event DomainUpdated(string oldDomain, string newDomain);
    event CredentialIssuedByPolicyOwner(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);
    event WalletBanned(address indexed wallet, uint256 indexed policyId);
    event WalletUnbanned(address indexed wallet, uint256 indexed policyId);

    /// @notice Upper bound for a policy's credentialDuration, keeping block.timestamp +
    ///         credentialDuration far below the uint64 range heldUntil is stored in.
    uint64 public constant MAX_CREDENTIAL_DURATION = 10 * 365 days;

    string public domain;
    address public admin;
    IPolicyEvaluator public policyEvaluator;
    bool public paused;

    mapping(uint256 policyId => Policy) internal _policies;
    mapping(address wallet => mapping(uint256 policyId => uint64)) public heldUntil;
    mapping(uint256 policyId => mapping(bytes32 nullifier => address wallet)) public nullifierWallet;
    mapping(address wallet => mapping(uint256 policyId => bool)) public banned;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert ZKPassportCredentials__NotAuthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert ZKPassportCredentials__Paused();
        _;
    }

    modifier onlyPolicyOwner(uint256 policyId) {
        if (_policies[policyId].owner != msg.sender) revert ZKPassportCredentials__NotPolicyOwner();
        _;
    }

    constructor(string memory _domain, address _admin, IPolicyEvaluator _policyEvaluator) ERC1155("") {
        if (_admin == address(0) || address(_policyEvaluator) == address(0)) {
            revert ZKPassportCredentials__ZeroAddress();
        }
        domain = _domain;
        admin = _admin;
        policyEvaluator = _policyEvaluator;
    }

    /// @notice Create a policy.
    /// @param salt Creator-scoped namespace: policyId = keccak256(creator, salt).
    /// @param requirements Opaque requirement bytes whose schema the current policy evaluator
    ///        owns.
    /// @param credentialDuration Seconds a credential stays valid after each issuance or
    ///        renewal; must be between 1 and MAX_CREDENTIAL_DURATION (10 years).
    /// @param metadataURL Display metadata for the policy's token, served by uri(policyId)
    /// @param ownerIssuable Whether the owner is allowed to issue credentials without a proof via
    ///        ownerIssue(); immutable after creation.
    /// @param ownerBannable Whether the owner is allowed to ban a wallet via ban(), which also
    ///        removes any standing credential; immutable after creation.
    /// @param ownerEditable Whether the owner is allowed to change the policy's requirements
    ///        after creation via setRequirements(); immutable after creation.
    /// @return policyId The policy id, also the ERC-1155 tokenId of its credentials.
    function createPolicy(
        bytes32 salt,
        bytes calldata requirements,
        uint64 credentialDuration,
        string calldata metadataURL,
        bool ownerIssuable,
        bool ownerBannable,
        bool ownerEditable
    ) external whenNotPaused returns (uint256 policyId) {
        if (credentialDuration == 0 || credentialDuration > MAX_CREDENTIAL_DURATION) {
            revert ZKPassportCredentials__InvalidCredentialDuration();
        }
        IPolicyEvaluator evaluator = policyEvaluator;
        evaluator.validateRequirements(requirements);

        policyId = uint256(keccak256(abi.encode(msg.sender, salt)));
        if (_policies[policyId].owner != address(0)) revert ZKPassportCredentials__PolicyAlreadyExists(policyId);

        Policy storage policy = _policies[policyId];
        policy.owner = msg.sender;
        policy.credentialDuration = credentialDuration;
        policy.ownerIssuable = ownerIssuable;
        policy.ownerBannable = ownerBannable;
        policy.ownerEditable = ownerEditable;
        policy.evaluator = address(evaluator);
        policy.requirements = requirements;
        policy.metadataURL = metadataURL;

        emit PolicyCreated(policyId, msg.sender);
        emit URI(metadataURL, policyId);
    }

    /// @notice Get a policy. Reverts for unknown ids.
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        Policy memory policy = _policies[policyId];
        if (policy.owner == address(0)) revert ZKPassportCredentials__PolicyNotFound(policyId);
        return policy;
    }

    /// @notice Update the display metadata URL of a policy.
    /// @param policyId The policy to update; only its owner may call.
    /// @param url The new metadata URL served by uri(policyId).
    function setMetadataURL(uint256 policyId, string calldata url) external onlyPolicyOwner(policyId) {
        _policies[policyId].metadataURL = url;
        emit PolicyMetadataURLUpdated(policyId, url);
        emit URI(url, policyId);
    }

    /// @notice Replace a policy's requirements. Only available when the policy opted in at
    ///         creation (`ownerEditable==true`). The new requirements are validated by the
    ///         policy's pinned evaluator and apply to all future issuance and renewals;
    ///         already-issued credentials are untouched until they expire or renew.
    /// @param policyId The policy to update; only its owner may call.
    /// @param requirements The new requirement bytes, encoded per the policy's pinned
    ///        evaluator schema.
    function setRequirements(uint256 policyId, bytes calldata requirements) external onlyPolicyOwner(policyId) {
        Policy storage policy = _policies[policyId];
        if (!policy.ownerEditable) revert ZKPassportCredentials__NotEditable();
        IPolicyEvaluator(policy.evaluator).validateRequirements(requirements);

        policy.requirements = requirements;
        emit PolicyRequirementsChanged(policyId);
    }

    /// @notice Permanently stop new issuance and renewals for a policy; existing credentials stay
    ///         valid until they expire.
    /// @param policyId The policy to retire; only its owner may call.
    function retire(uint256 policyId) external onlyPolicyOwner(policyId) {
        Policy storage policy = _policies[policyId];
        if (policy.retiredAt != 0) revert ZKPassportCredentials__PolicyRetired(policyId);
        policy.retiredAt = uint64(block.timestamp);
        emit PolicyRetired(policyId);
    }

    /// @notice The policy's metadata URL (ERC-1155 token URI); empty for unknown ids.
    /// @param policyId The policy, which is also the tokenId.
    function uri(uint256 policyId) public view override returns (string memory) {
        return _policies[policyId].metadataURL;
    }

    /// @notice The proof subscope a credential for this policy must be generated with
    /// @param policyId The policy the proof targets
    /// @return The subscope string: "attest:" followed by the hex-encoded policyId
    function policyScope(uint256 policyId) public pure returns (string memory) {
        return string.concat("attest:", Strings.toHexString(policyId, 32));
    }

    /// @notice Verify a proof and issue (or renew) a credential for the wallet the proof is
    ///         bound to. Issuance is permissionless: anyone who presents a proof, its verification
    ///         params, and the policyId may submit. The proof itself pins the recipient address
    ///         and chain.
    /// @param policyId The policy to issue a credential under.
    /// @param proofData Proof and verification data, generated off-chain for this registry's
    ///        domain and the policy's scope, encoded per the policy's pinned evaluator schema.
    function issue(uint256 policyId, bytes calldata proofData) external whenNotPaused {
        Policy storage policy = _policies[policyId];
        if (policy.owner == address(0)) revert ZKPassportCredentials__PolicyNotFound(policyId);
        if (policy.retiredAt != 0) revert ZKPassportCredentials__PolicyRetired(policyId);

        PolicyEvaluationResult memory result =
            IPolicyEvaluator(policy.evaluator).evaluate(domain, policyScope(policyId), policy.requirements, proofData);

        address wallet = result.wallet;
        if (wallet == address(0)) revert ZKPassportCredentials__ZeroAddress();
        if (banned[wallet][policyId]) revert ZKPassportCredentials__WalletBanned();

        if (result.unique) {
            _consumeNullifier(policyId, result.nullifier, wallet);
        }

        bool firstIssue = heldUntil[wallet][policyId] == 0;
        uint64 newHeldUntil = _issueCredential(wallet, policyId, policy.credentialDuration);

        if (firstIssue) {
            emit CredentialIssued(wallet, policyId, newHeldUntil, result.customData);
        } else {
            emit CredentialRenewed(wallet, policyId, newHeldUntil, result.customData);
        }
    }

    /// @notice Issue (or extend) a credential by policy-owner authority, without a proof.
    ///         Only available when the policy opted in at creation (`ownerIssuable==true`).
    ///         Note owner issuance never touches nullifier bindings, so on `enforceUniqueness`
    ///         policies it bypasses one-per-document sybil protection.
    /// @param wallet The recipient; must not be zero.
    /// @param policyId The policy to issue a credential under; only the policy owner may call.
    function ownerIssue(address wallet, uint256 policyId) external whenNotPaused onlyPolicyOwner(policyId) {
        Policy storage policy = _policies[policyId];
        if (!policy.ownerIssuable) revert ZKPassportCredentials__NotIssuableByOwner();
        if (policy.retiredAt != 0) revert ZKPassportCredentials__PolicyRetired(policyId);
        if (wallet == address(0)) revert ZKPassportCredentials__ZeroAddress();
        if (banned[wallet][policyId]) revert ZKPassportCredentials__WalletBanned();

        uint64 newHeldUntil = _issueCredential(wallet, policyId, policy.credentialDuration);
        emit CredentialIssuedByPolicyOwner(wallet, policyId, newHeldUntil);
    }

    function _issueCredential(address wallet, uint256 policyId, uint64 credentialDuration)
        internal
        returns (uint64 newHeldUntil)
    {
        newHeldUntil = uint64(block.timestamp + credentialDuration);
        // MAX_CREDENTIAL_DURATION keeps the sum well inside uint64, but a truncated heldUntil
        // would mint a token that balanceOf masks forever, so never let an expiry land in the
        // past.
        if (newHeldUntil <= block.timestamp) revert ZKPassportCredentials__InvalidCredentialDuration();
        heldUntil[wallet][policyId] = newHeldUntil;

        if (super.balanceOf(wallet, policyId) == 0) {
            _issueToken(wallet, policyId);
        }
    }

    /// @dev note we use _update instead of _mint: the soulbound token is issued by proof, not
    ///      transferred, so the ERC-1155 receiver acceptance check would only stop contract
    ///      wallets without onERC1155Received from ever holding a credential.
    function _issueToken(address wallet, uint256 policyId) internal {
        uint256[] memory ids = new uint256[](1);
        ids[0] = policyId;
        uint256[] memory values = new uint256[](1);
        values[0] = 1;
        _update(address(0), wallet, ids, values);
    }

    function _consumeNullifier(uint256 policyId, bytes32 nullifier, address wallet) internal {
        if (nullifier == bytes32(0)) revert ZKPassportCredentials__MissingNullifier();
        address prior = nullifierWallet[policyId][nullifier];
        if (prior != address(0) && prior != wallet) revert ZKPassportCredentials__SybilDetected(nullifier);
        nullifierWallet[policyId][nullifier] = wallet;
    }

    /// @notice 1 while the wallet holds an unexpired credential for the policy, else 0.
    /// @param account The wallet to check.
    /// @param id The policyId / tokenId.
    /// @return 1 or 0; expiry is time-based.
    function balanceOf(address account, uint256 id) public view override returns (uint256) {
        return heldUntil[account][id] >= block.timestamp ? 1 : 0;
    }

    /// @notice Lets the caller renounce their own credential for a policy. The caller
    ///         may re-prove and re-issue at will. Note the nullifier stays bound to the wallet even after
    ///         renouncing: releasing it would let a holder renounce and re-issue to a fresh
    ///         wallet, timing repeated access to a one-per-document gate. The document can only
    ///         ever re-credential the same wallet for this policy.
    /// @param policyId The policy whose credential the caller is giving up.
    function renounce(uint256 policyId) external {
        if (heldUntil[msg.sender][policyId] == 0) revert ZKPassportCredentials__NothingToRenounce();
        _clearCredential(msg.sender, policyId);
        emit CredentialRenounced(msg.sender, policyId);
    }

    function _clearCredential(address wallet, uint256 policyId) internal {
        heldUntil[wallet][policyId] = 0;

        if (super.balanceOf(wallet, policyId) > 0) {
            _burn(wallet, policyId, 1);
        }
    }

    /// @notice Ban a wallet from a policy, effective immediately: any standing credential is
    ///         removed in the same transaction, and issuance and renewal stay blocked until
    ///         unban(). WalletBanned is the only event emitted — it implies the wallet holds no
    ///         credential for the policy from this point. Only available on `ownerBannable`
    ///         policies. Banning is for targeted incident response:
    ///         sanctions propagation does NOT happen here, it is enforced at issuance/renewal
    ///         against the current sanctions root, bounded by the policy's `credentialDuration`.
    /// @param wallet The wallet to ban; must not already be banned.
    /// @param policyId The policy the ban applies to; only its owner may call.
    function ban(address wallet, uint256 policyId) external onlyPolicyOwner(policyId) {
        if (!_policies[policyId].ownerBannable) revert ZKPassportCredentials__NotBannable();
        if (banned[wallet][policyId]) revert ZKPassportCredentials__WalletBanned();
        banned[wallet][policyId] = true;
        emit WalletBanned(wallet, policyId);

        if (heldUntil[wallet][policyId] != 0) {
            _clearCredential(wallet, policyId);
        }
    }

    /// @notice Lift a ban placed on a wallet for a given policy, restoring its ability to be
    ///         issued credentials (by proof or by the owner) under the policy.
    /// @param wallet The banned wallet.
    /// @param policyId The policy the ban applies to; only its owner may call.
    function unban(address wallet, uint256 policyId) external onlyPolicyOwner(policyId) {
        if (!banned[wallet][policyId]) revert ZKPassportCredentials__NotBanned();
        banned[wallet][policyId] = false;
        emit WalletUnbanned(wallet, policyId);
    }

    /// @notice Emergency stop for issuance and policy creation; reads, renounce, and ban stay live.
    function pause() external onlyAdmin {
        paused = true;
        emit PausedStatusChanged(true);
    }

    /// @notice Lift the emergency stop.
    function unpause() external onlyAdmin {
        paused = false;
        emit PausedStatusChanged(false);
    }

    /// @notice Hand the admin role to a new account.
    /// @param newAdmin The new admin; must not be zero.
    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZKPassportCredentials__ZeroAddress();
        emit AdminUpdated(admin, newAdmin);
        admin = newAdmin;
    }

    /// @notice Point future policies at a new policy evaluator, which might define a new
    ///         requirements schema, proof-data encoding, or root verifier. Each preexisting
    ///         policy keeps the evaluator recorded at its creation: existing credentials,
    ///         nullifier bindings, and policies are untouched.
    /// @param newEvaluator The evaluator recorded by policies created from now on; must not be zero.
    function setPolicyEvaluator(IPolicyEvaluator newEvaluator) external onlyAdmin {
        if (address(newEvaluator) == address(0)) revert ZKPassportCredentials__ZeroAddress();
        emit PolicyEvaluatorUpdated(address(policyEvaluator), address(newEvaluator));
        policyEvaluator = newEvaluator;
    }

    /// @notice Change the domain proofs must be bound to. Takes effect for all future
    ///         issuance immediately: proofs are verified against the current domain at
    ///         issue-time, so proofs generated under the old domain stop verifying.
    ///         Existing credentials and nullifier bindings are untouched.
    /// @param newDomain The domain future proofs must be bound to
    function setDomain(string calldata newDomain) external onlyAdmin {
        emit DomainUpdated(domain, newDomain);
        domain = newDomain;
    }

    /// @notice Always reverts: credentials are soulbound
    function setApprovalForAll(address, bool) public pure override {
        revert ZKPassportCredentials__TokenIsSoulbound();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert ZKPassportCredentials__TokenIsSoulbound();
        super._update(from, to, ids, values);
    }
}
