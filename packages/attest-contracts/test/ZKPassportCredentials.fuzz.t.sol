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

    /// @notice Every duration createPolicy accepts must produce a live, strictly-future
    ///         heldUntil; everything above MAX_CREDENTIAL_DURATION must be rejected at creation.
    function testFuzzAcceptedDurationsIssueLiveCredentials(uint64 credentialDuration) public {
        credentialDuration = uint64(bound(credentialDuration, 1, zkPassportCredentials.MAX_CREDENTIAL_DURATION()));

        vm.prank(creator);
        uint256 policyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(credentialDuration)),
            _requirements(NullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            credentialDuration,
            "https://policy.example/fuzz",
            false,
            false,
            false
        );
        zkPassportCredentials.issue(policyId, _params());

        assertEq(zkPassportCredentials.heldUntil(wallet, policyId), block.timestamp + credentialDuration);
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testFuzzOverlongDurationsAreRejectedAtCreation(uint64 credentialDuration) public {
        credentialDuration =
            uint64(bound(credentialDuration, zkPassportCredentials.MAX_CREDENTIAL_DURATION() + 1, type(uint64).max));

        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__InvalidCredentialDuration.selector);
        zkPassportCredentials.createPolicy(
            bytes32(uint256(credentialDuration)),
            _requirements(NullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            credentialDuration,
            "https://policy.example/fuzz",
            false,
            false,
            false
        );
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
