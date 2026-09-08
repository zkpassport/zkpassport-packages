// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {NullifierType, ProofVerificationParams, ProofVerificationData, ServiceConfig} from "@registry/lib/Types.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {MockRootVerifier, MockVerifierHelper} from "./mocks/MockVerifier.sol";

contract ZKPassportCredentialsTestBase is Test {
    ZKPassportCredentials internal zkPassportCredentials;
    MockVerifierHelper internal mockHelper;
    MockRootVerifier internal mockVerifier;
    address internal admin = makeAddr("admin");
    address internal creator = makeAddr("creator");
    address internal wallet = makeAddr("wallet");
    string internal constant DOMAIN = "zkpassport.id";

    string[] internal noCountries;

    function _deployZKPassportCredentials(IRootVerifier verifier) internal {
        zkPassportCredentials = new ZKPassportCredentials(verifier, DOMAIN, admin);
    }

    function _deployWithMocks() internal {
        mockHelper = new MockVerifierHelper();
        mockVerifier = new MockRootVerifier(mockHelper);
        _deployZKPassportCredentials(IRootVerifier(address(mockVerifier)));
        mockHelper.setBoundData(wallet, block.chainid, "");
        mockHelper.setProofTimestamp(block.timestamp);
    }

    function _createDefaultPolicy() internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(uint256(1)), 30 days, false, false, 0, false, noCountries, "https://policy.example/1"
        );
    }

    function _params() internal pure returns (ProofVerificationParams memory) {
        // issue() reads the nullifier type from publicInputs[length - 3], as in
        // real outer proofs; the default is the everywhere-acceptable SALTED.
        bytes32[] memory publicInputs = new bytes32[](3);
        publicInputs[0] = bytes32(uint256(NullifierType.SALTED_NULLIFIER));
        return ProofVerificationParams({
            version: bytes32(uint256(1)),
            proofVerificationData: ProofVerificationData({vkeyHash: bytes32(0), proof: "", publicInputs: publicInputs}),
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
