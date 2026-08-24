// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";

contract ZKPassportAttestPredicatesTest is AttestTestBase {
    uint256 internal strictPolicyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        string[] memory excluded = new string[](2);
        excluded[0] = "PRK";
        excluded[1] = "IRN";
        vm.prank(creator);
        strictPolicyId =
            attest.createPolicy(bytes32(uint256(7)), 7 days, true, 18, true, excluded, "https://policy.example/kyc");
    }

    function testStrictPolicyIssuesWhenAllPredicatesPass() public {
        attest.issue(wallet, strictPolicyId, _params());
        assertEq(attest.balanceOf(wallet, strictPolicyId), 1);
    }

    function testIssueRevertsWhenAgeTooLow() public {
        mockHelper.setAgeOk(false);
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__AgeBelowMinimum.selector);
        attest.issue(wallet, strictPolicyId, _params());
    }

    function testIssueRevertsOnExcludedJurisdiction() public {
        mockHelper.setNationalityOk(false);
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__ExcludedJurisdiction.selector);
        attest.issue(wallet, strictPolicyId, _params());
    }

    function testIssueRevertsWhenSanctionsRootInvalid() public {
        mockHelper.setSanctionsOk(false);
        vm.expectRevert("MockVerifierHelper: sanctions root invalid");
        attest.issue(wallet, strictPolicyId, _params());
    }

    function testLaxPolicySkipsPredicateCalls() public {
        uint256 laxPolicyId = _createDefaultPolicy();
        mockHelper.setAgeOk(false);
        mockHelper.setNationalityOk(false);
        mockHelper.setSanctionsOk(false);
        attest.issue(wallet, laxPolicyId, _params());
        assertEq(attest.balanceOf(wallet, laxPolicyId), 1);
        assertEq(attest.nullifierWallet(laxPolicyId, mockVerifier.nullifier()), address(0));
    }

    function testUniquePolicyBindsNullifierToWallet() public {
        attest.issue(wallet, strictPolicyId, _params());
        assertEq(attest.nullifierWallet(strictPolicyId, mockVerifier.nullifier()), wallet);
    }

    function testSamePassportOtherWalletIsSybil() public {
        attest.issue(wallet, strictPolicyId, _params());
        address mallory = makeAddr("mallory");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportAttest.ZKPassportAttest__SybilDetected.selector, mockVerifier.nullifier())
        );
        attest.issue(mallory, strictPolicyId, _params());
    }

    function testSamePassportSameWalletCanRenew() public {
        attest.issue(wallet, strictPolicyId, _params());
        attest.issue(wallet, strictPolicyId, _params());
        assertEq(attest.balanceOf(wallet, strictPolicyId), 1);
    }

    function testUniquePolicyRejectsZeroNullifier() public {
        mockVerifier.setNullifier(bytes32(0));
        vm.expectRevert(ZKPassportAttest.ZKPassportAttest__MissingNullifier.selector);
        attest.issue(wallet, strictPolicyId, _params());
    }

    function testNullifiersAreScopedPerPolicy() public {
        attest.issue(wallet, strictPolicyId, _params());
        vm.prank(creator);
        uint256 secondUnique =
            attest.createPolicy(bytes32(uint256(8)), 7 days, true, 0, false, noCountries, "https://policy.example/2");
        address other = makeAddr("other");
        mockHelper.setBoundData(other, block.chainid, "");
        attest.issue(other, secondUnique, _params());
        assertEq(attest.balanceOf(other, secondUnique), 1);
    }

    function testRevokeReleasesNullifierForNewWallet() public {
        attest.issue(wallet, strictPolicyId, _params());
        vm.prank(wallet);
        attest.revoke(wallet, strictPolicyId);
        address recovered = makeAddr("recovered");
        mockHelper.setBoundData(recovered, block.chainid, "");
        attest.issue(recovered, strictPolicyId, _params());
        assertEq(attest.balanceOf(recovered, strictPolicyId), 1);
        assertEq(attest.nullifierWallet(strictPolicyId, mockVerifier.nullifier()), recovered);
    }

    function testActiveCredentialStillBlocksOtherWallets() public {
        attest.issue(wallet, strictPolicyId, _params());
        address mallory = makeAddr("mallory2");
        mockHelper.setBoundData(mallory, block.chainid, "");
        vm.expectRevert(
            abi.encodeWithSelector(ZKPassportAttest.ZKPassportAttest__SybilDetected.selector, mockVerifier.nullifier())
        );
        attest.issue(mallory, strictPolicyId, _params());
    }
}
