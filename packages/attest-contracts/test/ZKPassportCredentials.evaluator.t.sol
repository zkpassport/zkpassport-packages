// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {MockEvaluatorV2} from "./mocks/MockEvaluatorV2.sol";
import {MockResultEvaluator} from "./mocks/MockResultEvaluator.sol";
import {MockRootVerifier, MockVerifierHelper} from "./mocks/MockVerifier.sol";

contract ZKPassportCredentialsEvaluatorSwapTest is ZKPassportCredentialsTestBase {
    MockVerifierHelper internal v2Helper;
    MockRootVerifier internal v2Verifier;
    MockEvaluatorV2 internal evaluatorV2;
    bytes internal v2Requirements = abi.encode(uint256(18));

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        v2Helper = new MockVerifierHelper();
        v2Verifier = new MockRootVerifier(v2Helper);
        v2Helper.setBoundData(wallet, block.chainid, "");
        evaluatorV2 = new MockEvaluatorV2(IRootVerifier(address(v2Verifier)));
    }

    function _swapToV2() internal {
        vm.prank(admin);
        zkPassportCredentials.setPolicyEvaluator(evaluatorV2);
    }

    function _createV2Policy() internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(uint256(51)), v2Requirements, 30 days, "https://p.example/v2", false, false
        );
    }

    function testCreatePolicyValidatesUnderTheCurrentEvaluator() public {
        // V2-shaped bytes are a single word; V1's struct decode reverts on them.
        vm.prank(creator);
        vm.expectRevert();
        zkPassportCredentials.createPolicy(
            bytes32(uint256(51)), v2Requirements, 30 days, "https://p.example/v2", false, false
        );

        _swapToV2();
        uint256 policyId = _createV2Policy();
        assertEq(zkPassportCredentials.getPolicy(policyId).evaluator, address(evaluatorV2));
    }

    function testV2SchemaValidationRunsAtCreation() public {
        _swapToV2();
        vm.prank(creator);
        vm.expectRevert(MockEvaluatorV2.MockEvaluatorV2__InvalidRequirements.selector);
        zkPassportCredentials.createPolicy(bytes32(uint256(52)), abi.encode(uint256(200)), 30 days, "x", false, false);
    }

    function testPoliciesIssueUnderTheirOwnSchema() public {
        vm.prank(creator);
        uint256 v1PolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(53)),
            _requirements(NullifierType.SALTED_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            30 days,
            "x",
            false,
            false
        );
        _swapToV2();
        uint256 v2PolicyId = _createV2Policy();

        // The V1 policy still enforces its own schema: the nullifier is consumed.
        zkPassportCredentials.issue(v1PolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.nullifierWallet(v1PolicyId, mockVerifier.nullifier()), wallet);

        // The V2 policy is judged by V2: age passes, never unique, so no binding.
        zkPassportCredentials.issue(v2PolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, v2PolicyId), 1);
        assertEq(zkPassportCredentials.nullifierWallet(v2PolicyId, mockVerifier.nullifier()), address(0));
    }

    function testV2RequirementFailureRevertsIssue() public {
        _swapToV2();
        uint256 v2PolicyId = _createV2Policy();
        v2Helper.setAgeOk(false);
        vm.expectRevert(MockEvaluatorV2.MockEvaluatorV2__AgeNotMet.selector);
        zkPassportCredentials.issue(v2PolicyId, _params());
    }

    function testPoliciesVerifyUnderTheirOwnRootVerifier() public {
        // Each evaluator pins its root verifier, so a swap also swaps verifiers for future
        // policies only: breaking V2's verifier kills the V2 policy but not the V1 one, and
        // vice versa.
        uint256 v1PolicyId = _createDefaultPolicy();
        _swapToV2();
        uint256 v2PolicyId = _createV2Policy();

        v2Verifier.setValid(false);
        zkPassportCredentials.issue(v1PolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, v1PolicyId), 1);
        vm.expectRevert(MockEvaluatorV2.MockEvaluatorV2__InvalidProof.selector);
        zkPassportCredentials.issue(v2PolicyId, _params());

        v2Verifier.setValid(true);
        mockVerifier.setValid(false);
        zkPassportCredentials.issue(v2PolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, v2PolicyId), 1);
        vm.expectRevert(PolicyEvaluatorV1.PolicyEvaluator__InvalidProof.selector);
        zkPassportCredentials.issue(v1PolicyId, _params());
    }
}

contract ZKPassportCredentialsResultInvariantsTest is ZKPassportCredentialsTestBase {
    MockResultEvaluator internal resultEvaluator;
    uint256 internal policyId;
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        resultEvaluator = new MockResultEvaluator();
        vm.prank(admin);
        zkPassportCredentials.setPolicyEvaluator(resultEvaluator);
        policyId = _createDefaultPolicy();
    }

    function testLedgerRejectsZeroWalletResults() public {
        resultEvaluator.setResult(address(0), bytes32(0), false, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testLedgerRejectsUniqueResultsWithoutNullifier() public {
        resultEvaluator.setResult(recipient, bytes32(0), true, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__MissingNullifier.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testLedgerEnforcesSybilProtectionOnEvaluatorResults() public {
        bytes32 nullifier = bytes32(uint256(0xBEEF));
        resultEvaluator.setResult(recipient, nullifier, true, "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.nullifierWallet(policyId, nullifier), recipient);

        // The same nullifier bound to a different wallet is rejected by the ledger,
        // whatever the evaluator claims.
        resultEvaluator.setResult(makeAddr("other"), nullifier, true, "");
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, nullifier)
        );
        zkPassportCredentials.issue(policyId, _params());
    }
}
