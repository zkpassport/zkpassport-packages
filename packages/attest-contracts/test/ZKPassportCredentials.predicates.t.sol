// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ZKPassportCredentialsTestBase} from "./ZKPassportCredentialsTestBase.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";

contract ZKPassportCredentialsPredicatesTest is ZKPassportCredentialsTestBase {
    uint256 internal strictPolicyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        string[] memory excluded = new string[](2);
        excluded[0] = "PRK";
        excluded[1] = "IRN";
        vm.prank(creator);
        strictPolicyId = zkPassportCredentials.createPolicy(
            bytes32(uint256(7)), 7 days, true, false, 18, true, excluded, "https://policy.example/kyc"
        );
    }

    function testStrictPolicyIssuesWhenAllPredicatesPass() public {
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 1);
    }

    function testIssueRevertsWhenAgeTooLow() public {
        mockHelper.setAgeOk(false);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__AgeBelowMinimum.selector);
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
    }

    function testIssueRevertsOnExcludedJurisdiction() public {
        mockHelper.setNationalityOk(false);
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__ExcludedJurisdiction.selector);
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
    }

    function testIssueRevertsWhenSanctionsRootInvalid() public {
        mockHelper.setSanctionsOk(false);
        vm.expectRevert("MockVerifierHelper: sanctions root invalid");
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
    }

    function testLaxPolicySkipsPredicateCalls() public {
        uint256 laxPolicyId = _createDefaultPolicy();
        mockHelper.setAgeOk(false);
        mockHelper.setNationalityOk(false);
        mockHelper.setSanctionsOk(false);
        zkPassportCredentials.issue(wallet, laxPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, laxPolicyId), 1);
        assertEq(zkPassportCredentials.nullifierWallet(laxPolicyId, mockVerifier.nullifier()), address(0));
    }

    function testUniquePolicyBindsNullifierToWallet() public {
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        assertEq(zkPassportCredentials.nullifierWallet(strictPolicyId, mockVerifier.nullifier()), wallet);
    }

    function testSamePassportOtherWalletIsSybil() public {
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        address mallory = makeAddr("mallory");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(mallory, strictPolicyId, _params());
    }

    function testSamePassportSameWalletCanRenew() public {
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 1);
    }

    function testUniquePolicyRejectsZeroNullifier() public {
        mockVerifier.setNullifier(bytes32(0));
        vm.expectRevert(ZKPassportCredentials.ZKPassportCredentials__MissingNullifier.selector);
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
    }

    function testNullifiersAreScopedPerPolicy() public {
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        vm.prank(creator);
        uint256 secondUnique = zkPassportCredentials.createPolicy(
            bytes32(uint256(8)), 7 days, true, false, 0, false, noCountries, "https://policy.example/2"
        );
        address other = makeAddr("other");
        mockHelper.setBoundData(other, block.chainid, "");
        zkPassportCredentials.issue(other, secondUnique, _params());
        assertEq(zkPassportCredentials.balanceOf(other, secondUnique), 1);
    }

    function testRevokeKeepsNullifierBoundToOriginalWallet() public {
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, strictPolicyId);
        assertEq(zkPassportCredentials.nullifierWallet(strictPolicyId, mockVerifier.nullifier()), wallet);
        address mallory = makeAddr("recovered");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(mallory, strictPolicyId, _params());
    }

    function testSameWalletCanReissueAfterRevoke() public {
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        vm.prank(wallet);
        zkPassportCredentials.revoke(wallet, strictPolicyId);
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        assertEq(zkPassportCredentials.balanceOf(wallet, strictPolicyId), 1);
    }

    function testActiveCredentialStillBlocksOtherWallets() public {
        zkPassportCredentials.issue(wallet, strictPolicyId, _params());
        address mallory = makeAddr("mallory2");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportCredentials.ZKPassportCredentials__SybilDetected.selector, mockVerifier.nullifier()
            )
        );
        zkPassportCredentials.issue(mallory, strictPolicyId, _params());
    }
}
