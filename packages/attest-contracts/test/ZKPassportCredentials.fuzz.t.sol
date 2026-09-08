// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";

contract ZKPassportCredentialsFuzzTest is ZKPassportCredentialsTestBase {
    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
    }

    /// @notice heldUntil is stored via a truncating uint64 cast of block.timestamp + credentialDuration;
    ///         pin that the truncation is fail-safe (balance reflects the truncated value, never reverts).
    function testFuzzCredentialDurationTruncationFailsSafe(uint64 credentialDuration) public {
        vm.assume(credentialDuration > 0);

        vm.prank(creator);
        uint256 policyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(credentialDuration)),
            credentialDuration,
            _requirements(NullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            "https://policy.example/fuzz"
        );
        zkPassportCredentials.issue(policyId, _params());

        uint64 expectedHeldUntil = uint64(block.timestamp + credentialDuration);
        assertEq(zkPassportCredentials.heldUntil(wallet, policyId), expectedHeldUntil);

        uint256 expectedBalance = uint256(expectedHeldUntil) >= block.timestamp ? 1 : 0;
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), expectedBalance);
    }

    /// @notice Balance flips from 1 to 0 exactly at the policy's validity period boundary.
    function testFuzzExpiryBoundary(uint32 elapsed) public {
        uint256 policyId = _createDefaultPolicy();
        zkPassportCredentials.issue(policyId, _params());

        vm.warp(block.timestamp + elapsed);

        uint256 expectedBalance = elapsed <= 30 days ? 1 : 0;
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), expectedBalance);
    }

    /// @notice Any policy id that was never created reverts with ZKPassportCredentials__PolicyNotFound.
    function testFuzzUnknownPolicyIdReverts(uint256 policyId) public {
        uint256 knownPolicyId = _createDefaultPolicy();
        vm.assume(policyId != knownPolicyId);

        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__PolicyNotFound.selector, policyId)
        );
        zkPassportCredentials.getPolicy(policyId);
    }
}
