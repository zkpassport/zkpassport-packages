pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../src/RootRegistry.sol";
import "../src/VerifierHelper.sol";
import {NullifierType} from "../src/lib/Types.sol";

contract VerifierHelperTest is Test {
    VerifierHelper public helper;

    function setUp() public {
        helper = new VerifierHelper(new RootRegistry(address(0x1), address(0x2)));
    }

    function publicInputsWithNullifierType(NullifierType nullifierType) internal pure returns (bytes32[] memory) {
        bytes32[] memory publicInputs = new bytes32[](8);
        publicInputs[publicInputs.length - 3] = bytes32(uint256(nullifierType));
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
}
