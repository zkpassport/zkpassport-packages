pragma solidity ^0.8.30;

import {RootValidationMode} from "../src/IRegistryInstance.sol";

library TestConstants {
    uint256 constant DEFAULT_TREE_HEIGHT = 12;
    RootValidationMode constant DEFAULT_VALIDATION_MODE = RootValidationMode.LATEST_ONLY;
    uint256 constant DEFAULT_VALIDITY_WINDOW = 3600; // 1 hour
}
