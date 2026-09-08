// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {NullifierType, ProofVerificationParams, ProofVerificationData, ServiceConfig} from "@registry/lib/Types.sol";
import {ZKPassportCredentials} from "../src/ZKPassportCredentials.sol";
import {CredentialIssuanceModuleV1} from "../src/CredentialIssuanceModuleV1.sol";
import {PolicyEvaluatorV1} from "../src/PolicyEvaluatorV1.sol";
import {IRootVerifier} from "@registry/IRootVerifier.sol";
import {MockRootVerifier, MockVerifierHelper} from "./mocks/MockVerifier.sol";

contract ZKPassportCredentialsTestBase is Test {
    ZKPassportCredentials internal zkPassportCredentials;
    CredentialIssuanceModuleV1 internal credentialIssuanceModule;
    PolicyEvaluatorV1 internal evaluator;
    MockVerifierHelper internal mockHelper;
    MockRootVerifier internal mockVerifier;
    address internal admin = makeAddr("admin");
    address internal creator = makeAddr("creator");
    address internal wallet = makeAddr("wallet");
    string internal constant DOMAIN = "zkpassport.id";

    string[] internal noCountries;

    function _deployZKPassportCredentials(IRootVerifier verifier) internal {
        credentialIssuanceModule = new CredentialIssuanceModuleV1(verifier);
        evaluator = new PolicyEvaluatorV1();
        zkPassportCredentials = new ZKPassportCredentials(DOMAIN, admin, credentialIssuanceModule, evaluator);
    }

    function _deployWithMocks() internal {
        mockHelper = new MockVerifierHelper();
        mockVerifier = new MockRootVerifier(mockHelper);
        _deployZKPassportCredentials(IRootVerifier(address(mockVerifier)));
        mockHelper.setBoundData(wallet, block.chainid, "");
        mockHelper.setProofTimestamp(block.timestamp);
    }

    function _emptyRequirements(NullifierType uniqueIdentifierType)
        internal
        view
        returns (PolicyEvaluatorV1.PolicyRequirements memory r)
    {
        r.uniqueIdentifierType = uniqueIdentifierType;
        r.enforceUniqueness = uniqueIdentifierType != NullifierType.NONE_NULLIFIER;
        r.includedNationalities = noCountries;
        r.excludedNationalities = noCountries;
    }

    function _requirements(
        NullifierType uniqueIdentifierType,
        uint8 minAge,
        PolicyEvaluatorV1.SanctionsMode sanctionsMode,
        string[] memory excludedNationalities
    ) internal view returns (bytes memory) {
        PolicyEvaluatorV1.PolicyRequirements memory r = _emptyRequirements(uniqueIdentifierType);
        r.minAge = minAge;
        r.sanctionsMode = sanctionsMode;
        r.excludedNationalities = excludedNationalities;
        return abi.encode(r);
    }

    function _createDefaultPolicy() internal returns (uint256) {
        vm.prank(creator);
        return zkPassportCredentials.createPolicy(
            bytes32(uint256(1)),
            30 days,
            _requirements(NullifierType.NONE_NULLIFIER, 0, PolicyEvaluatorV1.SanctionsMode.NONE, noCountries),
            "https://policy.example/1"
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

    function _paramsWithNullifierType(NullifierType nullifierType)
        internal
        pure
        returns (ProofVerificationParams memory params)
    {
        params = _params();
        params.proofVerificationData.publicInputs = new bytes32[](3);
        params.proofVerificationData.publicInputs[0] = bytes32(uint256(nullifierType));
    }

    function _devModeParams() internal pure returns (ProofVerificationParams memory params) {
        params = _params();
        params.serviceConfig.devMode = true;
    }
}
