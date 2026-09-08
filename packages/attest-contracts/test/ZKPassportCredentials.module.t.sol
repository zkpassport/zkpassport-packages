// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {MockIssuanceModuleV2} from "./mocks/MockIssuanceModuleV2.sol";

contract ZKPassportCredentialsModuleSwapTest is ZKPassportCredentialsTestBase {
    MockIssuanceModuleV2 internal newModule;
    uint256 internal policyId;
    address internal recipient = makeAddr("recipient");

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
        newModule = new MockIssuanceModuleV2();
    }

    function _swapToNewModule() internal {
        vm.prank(admin);
        zkPassportCredentials.setCredentialIssuanceModule(newModule);
    }

    function testSwapRoutesExistingPoliciesThroughTheNewModule() public {
        // Baseline: under the original module the same params credit the proof-bound wallet.
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, policyId), 1);
        assertEq(zkPassportCredentials.balanceOf(recipient, policyId), 0);

        // Unlike the evaluator, the module is not pinned per policy: after the swap the
        // same policy and params are judged by the new module, whose verdict credits
        // a different wallet.
        _swapToNewModule();
        newModule.setVerdict(recipient, bytes32(0), false, "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.balanceOf(recipient, policyId), 1);
    }

    function testLedgerRejectsZeroWalletVerdicts() public {
        _swapToNewModule();
        newModule.setVerdict(address(0), bytes32(0), false, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ZeroAddress.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testLedgerRejectsUniqueVerdictsWithoutNullifier() public {
        _swapToNewModule();
        newModule.setVerdict(recipient, bytes32(0), true, "");
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__MissingNullifier.selector);
        zkPassportCredentials.issue(policyId, _params());
    }

    function testLedgerEnforcesSybilProtectionOnModuleVerdicts() public {
        _swapToNewModule();
        bytes32 nullifier = bytes32(uint256(0xBEEF));
        newModule.setVerdict(recipient, nullifier, true, "");
        zkPassportCredentials.issue(policyId, _params());
        assertEq(zkPassportCredentials.nullifierWallet(policyId, nullifier), recipient);

        // The same nullifier bound to a different wallet is rejected by the ledger,
        // whatever the module claims.
        newModule.setVerdict(makeAddr("other"), nullifier, true, "");
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, nullifier)
        );
        zkPassportCredentials.issue(policyId, _params());
    }
}
