// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";
import {IRootVerifier} from "../src/interfaces/IRootVerifier.sol";

contract AttestTestBase is Test {
    ZKPassportAttest internal attest;
    address internal admin = makeAddr("admin");
    address internal guardian = makeAddr("guardian");
    address internal creator = makeAddr("creator");
    address internal wallet = makeAddr("wallet");
    string internal constant DOMAIN = "zkpassport.id";

    string[] internal noCountries;

    function _deployAttest(IRootVerifier verifier) internal {
        attest = new ZKPassportAttest(verifier, DOMAIN, admin, guardian);
    }

    function _createDefaultPolicy() internal returns (uint256) {
        vm.prank(creator);
        return
            attest.createPolicy(bytes32(uint256(1)), 30 days, false, 0, false, noCountries, "https://policy.example/1");
    }
}
