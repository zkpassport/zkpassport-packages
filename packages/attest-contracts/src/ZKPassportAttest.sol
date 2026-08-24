// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IRootVerifier} from "./interfaces/IRootVerifier.sol";
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

    event PolicyCreated(uint256 indexed policyId, address indexed owner, address hook);
    event PolicyMetadataURLUpdated(uint256 indexed policyId, string url);

    IRootVerifier public immutable rootVerifier;
    string public domain;
    address public admin;
    address public guardian;

    mapping(uint256 policyId => Policy) internal _policies;

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
}
