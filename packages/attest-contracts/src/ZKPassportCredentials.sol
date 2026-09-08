// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ProofVerificationParams} from "@registry/lib/Types.sol";
import {ICredentialIssuanceModule, CredentialIssuanceVerdict} from "./ICredentialIssuanceModule.sol";
import {IPolicyEvaluator} from "./IPolicyEvaluator.sol";

/**
 * @title  ZKPassportCredentials
 * @notice Soulbound ERC-1155 credential ledger: one tokenId per policy (tokenId=policyId).
 *         Issuance logic is delegated to an `ICredentialIssuanceModule`, upgradeable by the
 *         contract admin via `setCredentialIssuanceModule`.
 *         Policy evaluation is similarly upgradeable by the contract admin via
 *         `setPolicyEvaluator`. Policy `requirements` are generic (bytes): the policy evaluator
 *         contract is responsible for decoding and evaluating whether a proof satisfies the
 *         policy requirements.
 */
contract ZKPassportCredentials is ERC1155 {
    struct Policy {
        address owner;
        uint64 credentialDuration;
        bool ownerGrantable;
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
    error ZKPassportCredentials__NotRevocable();
    error ZKPassportCredentials__NothingToRevoke();
    error ZKPassportCredentials__Paused();
    error ZKPassportCredentials__NotGrantable();
    error ZKPassportCredentials__NotAuthorized();
    error ZKPassportCredentials__ZeroAddress();

    event PolicyCreated(uint256 indexed policyId, address indexed owner);
    event PolicyMetadataURLUpdated(uint256 indexed policyId, string url);
    event PolicyRetired(uint256 indexed policyId);
    event CredentialIssued(address indexed wallet, uint256 indexed policyId, uint64 heldUntil, string customData);
    event CredentialRenewed(address indexed wallet, uint256 indexed policyId, uint64 heldUntil, string customData);
    event CredentialRevoked(address indexed wallet, uint256 indexed policyId, address by);
    event PausedStatusChanged(bool paused);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event CredentialIssuanceModuleUpdated(address indexed oldModule, address indexed newModule);
    event PolicyEvaluatorUpdated(address indexed oldEvaluator, address indexed newEvaluator);
    event DomainUpdated(string oldDomain, string newDomain);
    event CredentialGranted(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);

    string public domain;
    address public admin;
    ICredentialIssuanceModule public credentialIssuanceModule;
    IPolicyEvaluator public policyEvaluator;
    bool public paused;

    mapping(uint256 policyId => Policy) internal _policies;
    mapping(address wallet => mapping(uint256 policyId => uint64)) public heldUntil;
    mapping(uint256 policyId => mapping(bytes32 nullifier => address wallet)) public nullifierWallet;

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

    modifier onlyHolderOrPolicyOwner(address wallet, uint256 policyId) {
        if (msg.sender != wallet && msg.sender != _policies[policyId].owner) {
            revert ZKPassportCredentials__NotRevocable();
        }
        _;
    }

    constructor(
        string memory _domain,
        address _admin,
        ICredentialIssuanceModule _credentialIssuanceModule,
        IPolicyEvaluator _policyEvaluator
    ) ERC1155("") {
        if (
            _admin == address(0) || address(_credentialIssuanceModule) == address(0)
                || address(_policyEvaluator) == address(0)
        ) {
            revert ZKPassportCredentials__ZeroAddress();
        }
        domain = _domain;
        admin = _admin;
        credentialIssuanceModule = _credentialIssuanceModule;
        policyEvaluator = _policyEvaluator;
    }

    /// @notice Create a policy; the id is namespaced by creator and salt and stable across
    ///         chains. Requirements are opaque bytes whose schema the current admin-set
    ///         evaluator owns — they are validated here once so malformed policies fail at
    ///         creation. The evaluator in force is recorded on the policy and, with the
    ///         requirements, is immutable for the life of the policy: issuance and renewals
    ///         keep evaluating under the schema the policy was created with, even after the
    ///         admin points new policies at a newer evaluator.
    function createPolicy(
        bytes32 salt,
        uint64 credentialDuration,
        bool ownerGrantable,
        bytes calldata requirements,
        string calldata metadataURL
    ) external whenNotPaused returns (uint256 policyId) {
        if (credentialDuration == 0) {
            revert ZKPassportCredentials__InvalidCredentialDuration();
        }
        IPolicyEvaluator evaluator = policyEvaluator;
        evaluator.validateRequirements(requirements);

        policyId = uint256(keccak256(abi.encode(msg.sender, salt)));
        if (_policies[policyId].owner != address(0)) revert ZKPassportCredentials__PolicyAlreadyExists(policyId);

        Policy storage policy = _policies[policyId];
        policy.owner = msg.sender;
        policy.credentialDuration = credentialDuration;
        policy.ownerGrantable = ownerGrantable;
        policy.evaluator = address(evaluator);
        policy.requirements = requirements;
        policy.metadataURL = metadataURL;

        emit PolicyCreated(policyId, msg.sender);
    }

    /// @notice Full policy struct; reverts for unknown ids
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        Policy memory policy = _policies[policyId];
        if (policy.owner == address(0)) revert ZKPassportCredentials__PolicyNotFound(policyId);
        return policy;
    }

    /// @notice Update the display metadata URL; requirements are immutable
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

    /// @notice Verify a proof and grant (or extend) a credential for the wallet the proof is
    ///         bound to. Issuance is permissionless: anyone holding the proof, its verification
    ///         params, and the policyId — a relayer included — may submit; the proof itself pins
    ///         the recipient wallet and chain, so the caller can redirect nothing.
    ///         The issuance module judges whether a credential may issue; this ledger alone
    ///         decides how state mutates, so no module can rebind a nullifier, stretch a
    ///         credential's lifetime, or alter the token.
    function issue(uint256 policyId, ProofVerificationParams calldata params) external whenNotPaused {
        Policy storage policy = _policies[policyId];
        if (policy.owner == address(0)) revert ZKPassportCredentials__PolicyNotFound(policyId);
        if (policy.retiredAt != 0) revert ZKPassportCredentials__PolicyRetired(policyId);

        CredentialIssuanceVerdict memory verdict = credentialIssuanceModule.judge(
            domain, policyScope(policyId), policy.evaluator, policy.requirements, params
        );

        address wallet = verdict.wallet;
        if (wallet == address(0)) revert ZKPassportCredentials__ZeroAddress();

        if (verdict.unique) {
            _consumeNullifier(policyId, verdict.nullifier, wallet);
        }

        bool firstIssue = heldUntil[wallet][policyId] == 0;
        uint64 newHeldUntil = _issueCredential(wallet, policyId, policy.credentialDuration);

        if (firstIssue) {
            emit CredentialIssued(wallet, policyId, newHeldUntil, verdict.customData);
        } else {
            emit CredentialRenewed(wallet, policyId, newHeldUntil, verdict.customData);
        }
    }

    /// @notice Issue (or extend) a credential by policy-owner authority, without a proof.
    ///         Only available when the policy opted in at creation (`ownerGrantable`).
    ///         Grants never touch nullifier bindings, so on `enforceUniqueness` policies
    ///         they bypass one-per-document sybil protection — that is the meaning of
    ///         owner authority; the proof path is unaffected.
    function grant(address wallet, uint256 policyId) external whenNotPaused onlyPolicyOwner(policyId) {
        Policy storage policy = _policies[policyId];
        if (!policy.ownerGrantable) revert ZKPassportCredentials__NotGrantable();
        if (policy.retiredAt != 0) revert ZKPassportCredentials__PolicyRetired(policyId);
        if (wallet == address(0)) revert ZKPassportCredentials__ZeroAddress();

        uint64 newHeldUntil = _issueCredential(wallet, policyId, policy.credentialDuration);
        emit CredentialGranted(wallet, policyId, newHeldUntil);
    }

    function _issueCredential(address wallet, uint256 policyId, uint64 credentialDuration)
        internal
        returns (uint64 newHeldUntil)
    {
        newHeldUntil = uint64(block.timestamp + credentialDuration);
        heldUntil[wallet][policyId] = newHeldUntil;

        if (super.balanceOf(wallet, policyId) == 0) {
            _grantToken(wallet, policyId);
        }
    }

    /// @dev _update instead of _mint: the soulbound token is granted by proof, not
    ///      transferred, so the ERC-1155 receiver acceptance check would only stop
    ///      contract wallets without onERC1155Received from ever holding a credential.
    function _grantToken(address wallet, uint256 policyId) internal {
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

    /// @notice 1 while the wallet holds an unexpired credential for the policy, else 0
    function balanceOf(address account, uint256 id) public view override returns (uint256) {
        return heldUntil[account][id] >= block.timestamp ? 1 : 0;
    }

    /// @notice Remove a credential; only the holder or the policy owner.
    ///         Policy-owner revocation is targeted incident response (court order, wrongly
    ///         issued credential) — sanctions propagation does NOT happen here: it is enforced at
    ///         issuance/renewal against the current sanctions root, bounded by the policy's
    ///         credentialDuration, with no per-address enumeration.
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

    /// @notice Emergency stop for issuance and policy creation; reads and revocation stay live
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

    /// @notice Swap the issuance pipeline; existing credentials, nullifier bindings,
    ///         and policies are untouched — only future issuance goes through the new module
    function setCredentialIssuanceModule(ICredentialIssuanceModule newModule) external onlyAdmin {
        if (address(newModule) == address(0)) revert ZKPassportCredentials__ZeroAddress();
        emit CredentialIssuanceModuleUpdated(address(credentialIssuanceModule), address(newModule));
        credentialIssuanceModule = newModule;
    }

    /// @notice Point future policies at a new evaluator (a new requirements schema).
    ///         Unlike a module swap, this touches nothing that already exists: each policy
    ///         keeps the evaluator recorded at its creation, so existing policies — their
    ///         issuance and renewals included — are unaffected.
    function setPolicyEvaluator(IPolicyEvaluator newEvaluator) external onlyAdmin {
        if (address(newEvaluator) == address(0)) revert ZKPassportCredentials__ZeroAddress();
        emit PolicyEvaluatorUpdated(address(policyEvaluator), address(newEvaluator));
        policyEvaluator = newEvaluator;
    }

    /// @notice Change the domain proofs must be bound to. Takes effect for all future
    ///         issuance immediately: proofs are verified against the current domain at
    ///         issue-time, so proofs generated under the old domain stop verifying.
    ///         Existing credentials and nullifier bindings are untouched.
    function setDomain(string calldata newDomain) external onlyAdmin {
        emit DomainUpdated(domain, newDomain);
        domain = newDomain;
    }

    function setApprovalForAll(address, bool) public pure override {
        revert ZKPassportCredentials__TokenIsSoulbound();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert ZKPassportCredentials__TokenIsSoulbound();
        super._update(from, to, ids, values);
    }
}
