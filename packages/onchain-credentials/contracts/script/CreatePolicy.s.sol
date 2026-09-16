// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {IPolicyEvaluator} from "../src/IPolicyEvaluator.sol";
import {FaceMatchMode, NullifierType} from "@registry/lib/Types.sol";

/**
 * Create a policy on a ZKPassportCredentials deployment. Every requirement is read from the
 * environment. No requirement has a default: they are fixed once the policy is created, and
 * defaulting one silently ships a policy that screens differently than intended. Set each
 * explicitly, using an empty string for a nationality list you do not want to filter on.
 *
 *   ZKPASSPORT_CREDENTIALS_ADDRESS   required
 *   POLICY_SALT                      required, bytes32; policyId = keccak256(creator, salt)
 *   POLICY_METADATA_URL              required; served by uri(policyId), so prefer an immutable URI
 *   POLICY_MIN_AGE                   required; the proof must commit this exact value, 0 disables
 *   POLICY_SANCTIONS_MODE            required, none | normal | strict
 *   POLICY_FACEMATCH_MODE            required, none | regular | strict
 *   POLICY_NULLIFIER_TYPE            required, none | salted | non_salted | salted_mock |
 *                                    non_salted_mock
 *   POLICY_ENFORCE_UNIQUENESS        required; needs a nullifier type other than none
 *   POLICY_INCLUDED_NATIONALITIES    required, comma separated ISO 3166-1 alpha-3, any order
 *   POLICY_EXCLUDED_NATIONALITIES    required, comma separated ISO 3166-1 alpha-3, any order
 *   POLICY_DURATION_DAYS             default 90; also bounds how stale a sanctions check may be
 *   POLICY_OWNER_ISSUABLE            default false; ownerIssue() bypasses nullifier bookkeeping
 *   POLICY_OWNER_BANNABLE            default false; true lets the owner ban a wallet, removing any
 *                                    standing credential
 *   POLICY_OWNER_EDITABLE            default false; true lets the owner rewrite requirements later
 */
contract CreatePolicyScript is Script {
    function run() public {
        ZKPassportCredentials credentials = ZKPassportCredentials(vm.envAddress("ZKPASSPORT_CREDENTIALS_ADDRESS"));
        bytes32 salt = vm.envBytes32("POLICY_SALT");
        bytes memory encoded = _requirements();

        // Reject a malformed policy here rather than halfway through a broadcast.
        IPolicyEvaluator evaluator = credentials.policyEvaluator();
        evaluator.validateRequirements(encoded);
        console.log("credentials ", address(credentials));
        console.log("evaluator   ", address(evaluator));
        console.log("domain      ", credentials.domain());

        vm.startBroadcast();
        uint256 policyId = credentials.createPolicy(
            salt,
            encoded,
            uint64(vm.envOr("POLICY_DURATION_DAYS", uint256(90)) * 1 days),
            vm.envString("POLICY_METADATA_URL"),
            vm.envOr("POLICY_OWNER_ISSUABLE", false),
            vm.envOr("POLICY_OWNER_BANNABLE", false),
            vm.envOr("POLICY_OWNER_EDITABLE", false)
        );
        vm.stopBroadcast();

        console.log("policyId    ", policyId);
        console.log("policyScope ", credentials.policyScope(policyId));
        _record(credentials, policyId, salt);
    }

    function _requirements() internal view returns (bytes memory) {
        PolicyEvaluatorV1.PolicyRequirements memory r = PolicyEvaluatorV1.PolicyRequirements({
            uniqueIdentifierType: _nullifierType(vm.envString("POLICY_NULLIFIER_TYPE")),
            enforceUniqueness: vm.envBool("POLICY_ENFORCE_UNIQUENESS"),
            minAge: uint8(vm.envUint("POLICY_MIN_AGE")),
            sanctionsMode: _sanctionsMode(vm.envString("POLICY_SANCTIONS_MODE")),
            faceMatchMode: _faceMatchMode(vm.envString("POLICY_FACEMATCH_MODE")),
            includedNationalities: _countries("POLICY_INCLUDED_NATIONALITIES"),
            excludedNationalities: _countries("POLICY_EXCLUDED_NATIONALITIES")
        });
        console.log("minAge      ", r.minAge);
        console.log("uniqueness  ", r.enforceUniqueness);
        console.log("included    ", r.includedNationalities.length);
        console.log("excluded    ", r.excludedNationalities.length);
        return abi.encode(r);
    }

    function _record(ZKPassportCredentials credentials, uint256 policyId, bytes32 salt) internal {
        string memory json = "policy";
        vm.serializeUint(json, "policy_id", policyId);
        vm.serializeString(json, "scope", credentials.policyScope(policyId));
        vm.serializeAddress(json, "credentials", address(credentials));
        json = vm.serializeAddress(json, "evaluator", address(credentials.policyEvaluator()));
        vm.writeJson(
            json, string.concat("deployments/policy-", vm.toString(block.chainid), "-", vm.toString(salt), ".json")
        );
    }

    function _sanctionsMode(string memory value) private pure returns (PolicyEvaluatorV1.SanctionsMode) {
        bytes32 h = keccak256(bytes(value));
        if (h == keccak256("none")) return PolicyEvaluatorV1.SanctionsMode.NONE;
        if (h == keccak256("normal")) return PolicyEvaluatorV1.SanctionsMode.NORMAL;
        if (h == keccak256("strict")) return PolicyEvaluatorV1.SanctionsMode.STRICT;
        revert("POLICY_SANCTIONS_MODE must be none, normal or strict");
    }

    function _faceMatchMode(string memory value) private pure returns (FaceMatchMode) {
        bytes32 h = keccak256(bytes(value));
        if (h == keccak256("none")) return FaceMatchMode.NONE;
        if (h == keccak256("regular")) return FaceMatchMode.REGULAR;
        if (h == keccak256("strict")) return FaceMatchMode.STRICT;
        revert("POLICY_FACEMATCH_MODE must be none, regular or strict");
    }

    /// @dev The evaluator matches the proof's nullifier type exactly, with no mock-to-real folding,
    ///      so a dev-mode chain needs a policy that names a mock type to be testable at all.
    function _nullifierType(string memory value) private pure returns (NullifierType) {
        bytes32 h = keccak256(bytes(value));
        if (h == keccak256("none")) return NullifierType.NONE_NULLIFIER;
        if (h == keccak256("salted")) return NullifierType.SALTED_NULLIFIER;
        if (h == keccak256("non_salted")) return NullifierType.NON_SALTED_NULLIFIER;
        if (h == keccak256("salted_mock")) return NullifierType.SALTED_MOCK_NULLIFIER;
        if (h == keccak256("non_salted_mock")) return NullifierType.NON_SALTED_MOCK_NULLIFIER;
        revert("POLICY_NULLIFIER_TYPE must be none, salted, non_salted, salted_mock or non_salted_mock");
    }

    /// @dev An empty value means the list is unset, which disables that nationality check.
    function _countries(string memory name) private view returns (string[] memory) {
        string[] memory raw = vm.envString(name, ",");
        if (raw.length == 1 && bytes(raw[0]).length == 0) return new string[](0);
        return _sortCountries(raw);
    }

    /// @dev The evaluator requires ISO 3166-1 alpha-3 codes in strictly ascending order, so sort
    ///      here instead of making every caller get the ordering right by hand.
    function _sortCountries(string[] memory countries) internal pure returns (string[] memory) {
        for (uint256 i = 1; i < countries.length; i++) {
            string memory key = countries[i];
            uint256 j = i;
            while (j > 0 && _value(countries[j - 1]) > _value(key)) {
                countries[j] = countries[j - 1];
                j--;
            }
            countries[j] = key;
        }
        return countries;
    }

    function _value(string memory country) private pure returns (uint24 value) {
        bytes memory raw = bytes(country);
        require(raw.length == 3, "country codes must be ISO 3166-1 alpha-3");
        for (uint256 i = 0; i < 3; i++) {
            value = (value << 8) | uint24(uint8(raw[i]));
        }
    }
}

/**
 * Usage:
 * In zkpassport-packages/packages/onchain-credentials/contracts
 *
 *   export ZKPASSPORT_CREDENTIALS_ADDRESS=0x0000C0DeeB514524CfcB8d0d3D0a801dC1F7153c
 *   export POLICY_SALT=0x0000000000000000000000000000000000000000000000000000000000000001
 *   export POLICY_METADATA_URL=""
 *   export POLICY_MIN_AGE=18
 *   export POLICY_SANCTIONS_MODE=strict
 *   export POLICY_FACEMATCH_MODE=strict
 *   export POLICY_NULLIFIER_TYPE=none
 *   export POLICY_ENFORCE_UNIQUENESS=false
 *   export POLICY_INCLUDED_NATIONALITIES=""
 *   export POLICY_EXCLUDED_NATIONALITIES="SYR,CUB,PRK,IRN"
 *
 *   forge script script/CreatePolicy.s.sol --rpc-url <> --private-key <> --broadcast
 */