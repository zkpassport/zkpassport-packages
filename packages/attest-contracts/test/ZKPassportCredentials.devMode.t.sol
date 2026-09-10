// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {MockRootVerifier, MockVerifierHelper} from "./mocks/MockVerifier.sol";

contract ZKPassportCredentialsDevModeTest is ZKPassportCredentialsTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        mockHelper = new MockVerifierHelper();
        mockVerifier = new MockRootVerifier(mockHelper);
        evaluator = new PolicyEvaluatorV1(IRootVerifier(address(mockVerifier)), false);
        zkPassportCredentials = new ZKPassportCredentials(DOMAIN, admin, evaluator);
        mockHelper.setBoundData(wallet, block.chainid, "");
        mockHelper.setProofTimestamp(block.timestamp);
        policyId = _createDefaultPolicy();
    }

    function testNonDevEvaluatorRejectsDevModeProofs() public {
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__DevModeProofRejected.selector);
        zkPassportCredentials.issue(policyId, _devModeParams());
    }

    function testNonDevEvaluatorAcceptsRealProofs() public {
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testNonDevEvaluatorRejectsMockNullifierTypeClaims() public {
        vm.prank(creator);
        uint256 saltedPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(61)),
            _requirements(NullifierType.SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "x",
            false,
            false
        );
        // Nullifier types match exactly on every deployment, so a submission claiming a mock
        // type in its public inputs never satisfies a policy that requires the real type.
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(saltedPolicyId, _paramsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER));
    }

    function testEvaluatorExposesItsMode() public view {
        assertFalse(evaluator.devMode());
    }
}
