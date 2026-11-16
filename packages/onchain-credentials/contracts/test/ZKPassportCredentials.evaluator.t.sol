// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {NullifierType} from "@registry/lib/Types.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {PolicyEvaluatorV2} from "../src/PolicyEvaluatorV2.sol";
import {MockEvaluatorV1_2} from "./mocks/MockEvaluatorV1_2.sol";
import {MockResultEvaluator} from "./mocks/MockResultEvaluator.sol";
import {MockRootVerifier, MockVerifierHelper} from "./mocks/MockVerifier.sol";

contract ZKPassportCredentialsEvaluatorSwapTest is ZKPassportCredentialsTestBase {
    MockVerifierHelper internal v1_2Helper;
    MockRootVerifier internal v1_2Verifier;
    MockEvaluatorV1_2 internal evaluatorV1_2;
    bytes internal v1_2Requirements = abi.encode(uint256(18));

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        v1_2Helper = new MockVerifierHelper();
        v1_2Verifier = new MockRootVerifier(v1_2Helper);
        v1_2Helper.setBoundData(wallet, block.chainid, "");
        evaluatorV1_2 = new MockEvaluatorV1_2(IRootVerifier(address(v1_2Verifier)));
    }

    function testEvaluatorRejectsZeroRootVerifier() public {
        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__ZeroAddress.selector);
        new PolicyEvaluatorV2(IRootVerifier(address(0)), true, NullifierType.SALTED_NULLIFIER);
    }

    function testNoneEvaluatorIssuesNonUniquePolicies() public {
        _swapEvaluator(NullifierType.NONE_NULLIFIER);
        uint256 policyId = _createDefaultPolicy();
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testUniquenessPolicyOnNoneEvaluatorCannotIssue() public {
        _swapEvaluator(NullifierType.NONE_NULLIFIER);
        vm.prank(creator);
        uint256 policyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(54)),
            _requirements(0, PolicyEvaluatorV2.SanctionsMode.NONE, noCountries),
            30 days,
            "x",
            true,
            false,
            false,
            false
        );

        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__WrongNullifierType.selector);
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));

        // A NONE proof carries a zero nullifier, which the ledger cannot bind.
        mockVerifier.setNullifier(bytes32(0));
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__MissingNullifier.selector);
        zkPassportCredentials.issue(policyId, _paramsWithNullifierType(NullifierType.NONE_NULLIFIER));
    }

    function _swapToV1_2() internal {
        vm.prank(admin);
        zkPassportCredentials.setPolicyEvaluator(evaluatorV1_2);
    }

    function _createV1_2Policy() internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(uint256(51)), v1_2Requirements, 30 days, "https://p.example/v1_2", false, false, false, false
        );
    }

    function testCreatePolicyValidatesUnderTheCurrentEvaluator() public {
        // V1_2-shaped bytes are a single word; V2's struct decode reverts on them.
        vm.prank(creator);
        vm.expectRevert();
        zkPassportCredentials.createPolicy(
            bytes32(uint256(51)), v1_2Requirements, 30 days, "https://p.example/v1_2", false, false, false, false
        );

        _swapToV1_2();
        uint256 policyId = _createV1_2Policy();
        assertEq(zkPassportCredentials.getPolicy(policyId).evaluator, address(evaluatorV1_2));
    }

    function testV1_2SchemaValidationRunsAtCreation() public {
        _swapToV1_2();
        vm.prank(creator);
        vm.expectRevert(MockEvaluatorV1_2.MockEvaluatorV1_2__InvalidRequirements.selector);
        zkPassportCredentials.createPolicy(
            bytes32(uint256(52)), abi.encode(uint256(200)), 30 days, "x", false, false, false, false
        );
    }

    function testPoliciesIssueUnderTheirOwnSchema() public {
        vm.prank(creator);
        uint256 v2PolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(53)),
            _requirements(0, PolicyEvaluatorV2.SanctionsMode.NONE, noCountries),
            30 days,
            "x",
            true,
            false,
            false,
            false
        );
        _swapToV1_2();
        uint256 v1_2PolicyId = _createV1_2Policy();

        // The V2 policy is still judged by V2 and enforces uniqueness: the nullifier is consumed.
        zkPassportCredentials.issue(v2PolicyId, _paramsWithNullifierType(NullifierType.SALTED_NULLIFIER));
        assertEq(zkPassportCredentials.nullifierWallet(v2PolicyId, mockVerifier.nullifier()), wallet);

        // The V1_2 policy is judged by V1_2: age passes, and it does not enforce uniqueness, so
        // no binding.
        zkPassportCredentials.issue(v1_2PolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, v1_2PolicyId), 1);
        assertEq(zkPassportCredentials.nullifierWallet(v1_2PolicyId, mockVerifier.nullifier()), address(0));
    }

    function testV1_2RequirementFailureRevertsIssue() public {
        _swapToV1_2();
        uint256 v1_2PolicyId = _createV1_2Policy();
        v1_2Helper.setAgeOk(false);
        vm.expectRevert(MockEvaluatorV1_2.MockEvaluatorV1_2__AgeNotMet.selector);
        zkPassportCredentials.issue(v1_2PolicyId, _params());
    }

    function testPoliciesVerifyUnderTheirOwnRootVerifier() public {
        // Each evaluator pins its root verifier, so a swap also swaps verifiers for future
        // policies only: breaking V1_2's verifier kills the V1_2 policy but not the V2 one, and
        // vice versa.
        uint256 v2PolicyId = _createDefaultPolicy();
        _swapToV1_2();
        uint256 v1_2PolicyId = _createV1_2Policy();

        v1_2Verifier.setValid(false);
        zkPassportCredentials.issue(v2PolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, v2PolicyId), 1);
        vm.expectRevert(MockEvaluatorV1_2.MockEvaluatorV1_2__InvalidProof.selector);
        zkPassportCredentials.issue(v1_2PolicyId, _params());

        v1_2Verifier.setValid(true);
        mockVerifier.setValid(false);
        zkPassportCredentials.issue(v1_2PolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, v1_2PolicyId), 1);
        vm.expectRevert(PolicyEvaluatorV2.PolicyEvaluator__InvalidProof.selector);
        zkPassportCredentials.issue(v2PolicyId, _params());
    }

    function _createEditableV2Policy(bool enforceUniqueness) internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(uint256(55)),
            _requirements(0, PolicyEvaluatorV2.SanctionsMode.NONE, noCountries),
            30 days,
            "x",
            enforceUniqueness,
            false,
            false,
            true
        );
    }

    function testMigrateEvaluatorMovesPolicyToTheCurrentEvaluator() public {
        uint256 policyId = _createEditableV2Policy(false);
        _swapToV1_2();

        vm.expectEmit(true, true, true, false);
        emit ZKPassportCredentials.PolicyEvaluatorMigrated(policyId, address(evaluator), address(evaluatorV1_2));
        vm.expectEmit(true, false, false, false);
        emit ZKPassportCredentials.PolicyRequirementsChanged(policyId);
        vm.prank(creator);
        zkPassportCredentials.migrateEvaluator(policyId, v1_2Requirements);

        ZKPassportCredentials.CredentialsPolicy memory policy = zkPassportCredentials.getPolicy(policyId);
        assertEq(policy.evaluator, address(evaluatorV1_2));
        assertEq(policy.requirements, v1_2Requirements);
    }

    function testMigratedPolicyIssuesUnderTheNewEvaluator() public {
        uint256 policyId = _createEditableV2Policy(false);
        _swapToV1_2();
        vm.prank(creator);
        zkPassportCredentials.migrateEvaluator(policyId, v1_2Requirements);

        v1_2Helper.setAgeOk(false);
        vm.expectRevert(MockEvaluatorV1_2.MockEvaluatorV1_2__AgeNotMet.selector);
        zkPassportCredentials.issue(policyId, _params());

        v1_2Helper.setAgeOk(true);
        mockVerifier.setValid(false);
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
    }

    function testMigrateEvaluatorValidatesUnderTheCurrentEvaluator() public {
        uint256 policyId = _createEditableV2Policy(false);
        _swapToV1_2();

        vm.prank(creator);
        vm.expectRevert(MockEvaluatorV1_2.MockEvaluatorV1_2__InvalidRequirements.selector);
        zkPassportCredentials.migrateEvaluator(policyId, abi.encode(uint256(200)));
    }

    function testMigrateEvaluatorKeepsCredentialsAndBindings() public {
        uint256 policyId = _createEditableV2Policy(true);
        zkPassportCredentials.issue(policyId, _params());
        bytes32 boundNullifier = mockVerifier.nullifier();
        _swapToV1_2();

        vm.prank(creator);
        zkPassportCredentials.migrateEvaluator(policyId, v1_2Requirements);

        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
        assertEq(zkPassportCredentials.nullifierWallet(policyId, boundNullifier), wallet);
    }

    function testMigrateEvaluatorRevertsWhenNotOwnerEditable() public {
        uint256 policyId = _createDefaultPolicy();
        _swapToV1_2();

        vm.prank(creator);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotEditable.selector);
        zkPassportCredentials.migrateEvaluator(policyId, v1_2Requirements);
    }

    function testOnlyPolicyOwnerCanMigrateEvaluator() public {
        uint256 policyId = _createEditableV2Policy(false);
        _swapToV1_2();

        vm.prank(wallet);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__NotPolicyOwner.selector);
        zkPassportCredentials.migrateEvaluator(policyId, v1_2Requirements);
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

    function _createUniquePolicy() internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(bytes32(uint256(2)), "", 30 days, "x", true, false, false, false);
    }

    function testLedgerRejectsZeroWalletResults() public {
        resultEvaluator.setResult(address(0), bytes32(0), "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testLedgerRejectsMissingNullifierOnUniquePolicies() public {
        uint256 uniquePolicyId = _createUniquePolicy();
        resultEvaluator.setResult(recipient, bytes32(0), "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__MissingNullifier.selector);
        zkPassportCredentials.issue(uniquePolicyId, _params());
    }

    function testLedgerEnforcesSybilProtectionOnEvaluatorResults() public {
        uint256 uniquePolicyId = _createUniquePolicy();
        bytes32 nullifier = bytes32(uint256(0xBEEF));
        resultEvaluator.setResult(recipient, nullifier, "");
        zkPassportCredentials.issue(uniquePolicyId, _params());
        assertEq(zkPassportCredentials.nullifierWallet(uniquePolicyId, nullifier), recipient);

        // The same nullifier bound to a different wallet is rejected by the ledger,
        // whatever the evaluator returns.
        resultEvaluator.setResult(makeAddr("other"), nullifier, "");
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, nullifier)
        );
        zkPassportCredentials.issue(uniquePolicyId, _params());
    }

    function testLedgerLeavesNullifiersUnboundOnNonUniquePolicies() public {
        // Whether a nullifier is consumed is the policy's call, not the evaluator's: the same
        // nullifier credentials any number of wallets and a zero nullifier is accepted.
        bytes32 nullifier = bytes32(uint256(0xBEEF));
        resultEvaluator.setResult(recipient, nullifier, "");
        zkPassportCredentials.issue(policyId, _params());
        address other = makeAddr("other");
        resultEvaluator.setResult(other, nullifier, "");
        zkPassportCredentials.issue(policyId, _params());
        resultEvaluator.setResult(makeAddr("third"), bytes32(0), "");
        zkPassportCredentials.issue(policyId, _params());

        assertEq(zkPassportCredentials.nullifierWallet(policyId, nullifier), address(0));
        assertEq(zkPassportCredentials.balanceOf(recipient, policyId), 1);
        assertEq(zkPassportCredentials.balanceOf(other, policyId), 1);
    }
}
