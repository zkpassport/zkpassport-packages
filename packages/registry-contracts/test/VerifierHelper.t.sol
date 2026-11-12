pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/RootRegistry.sol";
import "../src/VerifierHelper.sol";
import {NullifierType, ProofType, DisclosedData} from "../src/lib/Types.sol";

contract VerifierHelperTest is Test {
    VerifierHelper public helper;

    function setUp() public {
        helper = new VerifierHelper(new RootRegistry(address(0x1), address(0x2)));
    }

    function publicInputsWithNullifierType(NullifierType nullifierType) internal pure returns (bytes32[] memory) {
        return publicInputsWithNullifierType(nullifierType, bytes32(uint256(1)));
    }

    function publicInputsWithNullifierType(NullifierType nullifierType, bytes32 nullifier)
        internal
        pure
        returns (bytes32[] memory)
    {
        bytes32[] memory publicInputs = new bytes32[](8);
        publicInputs[publicInputs.length - 3] = bytes32(uint256(nullifierType));
        publicInputs[publicInputs.length - 2] = nullifier;
        return publicInputs;
    }

    function testGetNullifierType() public view {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.SALTED_NULLIFIER);

        assertEq(uint256(helper.getNullifierType(publicInputs)), uint256(NullifierType.SALTED_NULLIFIER));
    }

    function testEnforceNullifierTypeAcceptsMatchingType() public view {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.SALTED_NULLIFIER);

        helper.enforceNullifierType(NullifierType.SALTED_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeRejectsMismatchedType() public {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.NON_SALTED_NULLIFIER);

        vm.expectRevert("Invalid nullifier type");
        helper.enforceNullifierType(NullifierType.SALTED_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeAcceptsMockOfExpectedType() public view {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.SALTED_MOCK_NULLIFIER);

        helper.enforceNullifierType(NullifierType.SALTED_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeRejectsMockOfAnotherType() public {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER);

        vm.expectRevert("Invalid nullifier type");
        helper.enforceNullifierType(NullifierType.SALTED_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeAcceptsMockWithHiddenNullifierForNone() public view {
        bytes32[] memory publicInputs =
            publicInputsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER, bytes32(0));

        helper.enforceNullifierType(NullifierType.NONE_NULLIFIER, publicInputs);
    }

    function testEnforceNullifierTypeRejectsMockWithNullifierForNone() public {
        bytes32[] memory publicInputs = publicInputsWithNullifierType(NullifierType.NON_SALTED_MOCK_NULLIFIER);

        vm.expectRevert("Invalid nullifier type");
        helper.enforceNullifierType(NullifierType.NONE_NULLIFIER, publicInputs);
    }

    function discloseInputs(bytes memory text, uint256 offset, bytes memory documentType)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory mask = new bytes(90);
        bytes memory disclosed = new bytes(90);
        for (uint256 i = 0; i < documentType.length; i++) {
            mask[i] = 0x01;
            disclosed[i] = documentType[i];
        }
        for (uint256 i = 0; i < text.length; i++) {
            mask[offset + i] = 0x01;
            disclosed[offset + i] = text[i];
        }
        return abi.encodePacked(uint8(ProofType.DISCLOSE), uint16(180), mask, disclosed);
    }

    function testGetDisclosedDataAcceptsIsIDCardMatchingDocumentType() public view {
        assertEq(helper.getDisclosedData(discloseInputs("DEU", 54, "P<"), false).nationality, "DEU");
        assertEq(helper.getDisclosedData(discloseInputs("FRA", 45, "ID"), true).nationality, "FRA");
    }

    function testGetDisclosedDataRejectsIsIDCardContradictingDocumentType() public {
        vm.expectRevert("Document type does not match isIDCard");
        helper.getDisclosedData(discloseInputs("DEU", 54, "P<"), true);
    }

    function testGetDisclosedDataTrustsIsIDCardWithoutDocumentType() public view {
        assertEq(helper.getDisclosedData(discloseInputs("FRA", 45, ""), true).nationality, "FRA");
    }
}
