// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ProofVerificationParams, ProofVerificationData, ServiceConfig} from "@registry/lib/Types.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";
import {IRootVerifier} from "../src/interfaces/IRootVerifier.sol";
import {MockRootVerifier, MockVerifierHelper} from "./mocks/MockVerifier.sol";

contract AttestTestBase is Test {
    ZKPassportAttest internal attest;
    MockVerifierHelper internal mockHelper;
    MockRootVerifier internal mockVerifier;
    address internal admin = makeAddr("admin");
    address internal guardian = makeAddr("guardian");
    address internal creator = makeAddr("creator");
    address internal wallet = makeAddr("wallet");
    string internal constant DOMAIN = "zkpassport.id";

    string[] internal noCountries;

    function _deployAttest(IRootVerifier verifier) internal {
        attest = new ZKPassportAttest(verifier, DOMAIN, admin, guardian);
    }

    function _deployWithMocks() internal {
        mockHelper = new MockVerifierHelper();
        mockVerifier = new MockRootVerifier(mockHelper);
        _deployAttest(IRootVerifier(address(mockVerifier)));
        mockHelper.setBoundData(wallet, block.chainid, "");
        mockHelper.setProofTimestamp(block.timestamp);
    }

    function _createDefaultPolicy() internal returns (uint256) {
        vm.prank(creator);
        return
            attest.createPolicy(bytes32(uint256(1)), 30 days, false, 0, false, noCountries, "https://policy.example/1");
    }

    function _params() internal pure returns (ProofVerificationParams memory) {
        return ProofVerificationParams({
            version: bytes32(uint256(1)),
            proofVerificationData: ProofVerificationData({
                vkeyHash: bytes32(0), proof: "", publicInputs: new bytes32[](0)
            }),
            committedInputs: "",
            serviceConfig: ServiceConfig({
                validityPeriodInSeconds: 0, domain: "zkpassport.id", scope: "", devMode: false
            })
        });
    }

    function _devModeParams() internal pure returns (ProofVerificationParams memory params) {
        params = _params();
        params.serviceConfig.devMode = true;
    }
}
