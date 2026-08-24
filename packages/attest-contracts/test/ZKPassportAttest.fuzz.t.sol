// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";

contract ZKPassportAttestFuzzTest is AttestTestBase {
    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
    }

    /// @notice heldUntil is stored via a truncating uint64 cast of block.timestamp + validityPeriod;
    ///         pin that the truncation is fail-safe (balance reflects the truncated value, never reverts).
    function testFuzzValidityPeriodTruncationFailsSafe(uint64 validityPeriod) public {
        vm.assume(validityPeriod > 0);

        vm.prank(creator);
        uint256 policyId = attest.createPolicy(
            bytes32(uint256(validityPeriod)),
            validityPeriod,
            false,
            0,
            false,
            noCountries,
            "https://policy.example/fuzz"
        );
        attest.issue(wallet, policyId, _params());

        uint64 expectedHeldUntil = uint64(block.timestamp + validityPeriod);
        assertEq(attest.heldUntil(wallet, policyId), expectedHeldUntil);

        uint256 expectedBalance = uint256(expectedHeldUntil) >= block.timestamp ? 1 : 0;
        assertEq(attest.balanceOf(wallet, policyId), expectedBalance);
    }

    /// @notice Balance flips from 1 to 0 exactly at the policy's validity period boundary.
    function testFuzzExpiryBoundary(uint32 elapsed) public {
        uint256 policyId = _createDefaultPolicy();
        attest.issue(wallet, policyId, _params());

        vm.warp(block.timestamp + elapsed);

        uint256 expectedBalance = elapsed <= 30 days ? 1 : 0;
        assertEq(attest.balanceOf(wallet, policyId), expectedBalance);
    }

    /// @notice Any policy id that was never created reverts with Attest__PolicyNotFound.
    function testFuzzUnknownPolicyIdReverts(uint256 policyId) public {
        uint256 knownPolicyId = _createDefaultPolicy();
        vm.assume(policyId != knownPolicyId);

        vm.expectRevert(abi.encodeWithSelector(ZKPassportAttest.Attest__PolicyNotFound.selector, policyId));
        attest.getPolicy(policyId);
    }
}
