# Attest Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/attest-contracts`: the ZKPassportAttest soulbound ERC-1155 credential registry with per-policy validation hooks, MockAuction simulator, tests, deploy script, and CI (PR 1 of the Uniswap stack).

**Architecture:** One `ZKPassportAttest` contract per chain holds permissionless policies (typed predicates) and time-boxed credentials (`heldUntil` gates `balanceOf`). `createPolicy` deploys an immutable `PolicyValidationHook` per policy implementing Uniswap's `IValidationHook`. Proofs verify through the existing `RootVerifier` in the sibling `registry-contracts` package, mocked at the interface boundary in tests.

**Tech Stack:** Foundry (forge 1.4.x), Solidity 0.8.30, OpenZeppelin v5 (new submodule), sibling remappings into `packages/registry-contracts`.

**Spec:** `docs/superpowers/specs/2026-08-24-uniswap-attest-design.md`

## Global Constraints

- Working directory for all commands: `packages/attest-contracts` (create in Task 1). All paths below are relative to it unless prefixed with `packages/` or `.github/`.
- solc pinned to `0.8.30`; `bytecode_hash = "none"`; optimizer on, 200 runs (mirrors `registry-contracts`).
- Custom errors named `Attest__PascalCase`; test functions named `testCamelCase` (repo convention, see `packages/registry-contracts/test/*.t.sol`).
- Commit messages: Conventional Commits with scope, capitalized subject, e.g. `feat(attest-contracts): Add policy creation`. No Claude attribution trailers (repo CLAUDE.md rule).
- `git add` by explicit file paths only — never `-A`, `-u`, or `.`.
- No inline comments unless a non-obvious constraint demands one; natspec on public functions.
- Run `forge fmt` before every commit so `forge fmt --check` stays green.
- The branch is `martin/uniswap-l1` (current worktree). All tasks except Task 11 commit here.

---

### Task 1: Package scaffold

**Files:**
- Create: `packages/attest-contracts/foundry.toml`
- Create: `packages/attest-contracts/package.json`
- Create: `packages/attest-contracts/lib/openzeppelin-contracts` (git submodule)

**Interfaces:**
- Consumes: `packages/registry-contracts/lib/forge-std` (existing submodule), `packages/registry-contracts/src` (sibling sources).
- Produces: a buildable Foundry package with remappings `forge-std/`, `@registry/`, `@openzeppelin/` that every later task compiles inside.

- [ ] **Step 1: Create the package directory and foundry.toml**

`packages/attest-contracts/foundry.toml`:

```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc = "0.8.30"
optimizer = true
optimizer_runs = 200
bytecode_hash = "none"
remappings = [
    "forge-std/=../registry-contracts/lib/forge-std/src/",
    "@registry/=../registry-contracts/src/",
    "@openzeppelin/=lib/openzeppelin-contracts/",
]
fs_permissions = [{ access = "read-write", path = "./deployments" }]

[lint]
lint_on_build = false
exclude_lints = ["mixed-case-function", "screaming-snake-case-immutable", "unwrapped-modifier-logic"]

[rpc_endpoints]
localhost = "http://localhost:8545"
anvil = "http://localhost:8545"
```

- [ ] **Step 2: Create package.json (mirrors registry-contracts)**

`packages/attest-contracts/package.json`:

```json
{
  "name": "attest-contracts",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "forge build",
    "test": "forge test",
    "check": "forge fmt --check && forge lint src",
    "format": "forge fmt"
  }
}
```

The root workspace globs `packages/*`, so no root package.json change is needed.

- [ ] **Step 3: Add the OpenZeppelin submodule pinned to the latest v5 release**

```bash
cd packages/attest-contracts
git submodule add https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
cd lib/openzeppelin-contracts
git checkout "$(git tag --list 'v5.*' --sort=-v:refname | head -1)"
cd ../..
```

- [ ] **Step 4: Verify the empty package builds**

```bash
mkdir src test script deployments
forge build
```

Expected: `Compiling... no files changed` or a successful empty build with exit 0.

- [ ] **Step 5: Commit**

```bash
git add foundry.toml package.json ../../.gitmodules lib/openzeppelin-contracts
git commit -m "feat(attest-contracts): Scaffold Foundry package with OZ and sibling remappings"
```

---

### Task 2: Interfaces

**Files:**
- Create: `src/interfaces/IValidationHook.sol`
- Create: `src/interfaces/IPolicyHookViews.sol`
- Create: `src/interfaces/IRootVerifier.sol`

**Interfaces:**
- Consumes: `ProofVerificationParams`, `BoundData` from `@registry/lib/Types.sol`.
- Produces (used by Tasks 3–10):
  - `IValidationHook.validate(uint256 maxPrice, uint128 amount, address owner, address sender, bytes calldata hookData)`
  - `IBaseERC1155ValidationHook.erc1155() → IERC1155`, `.tokenId() → uint256`
  - `IZKPassportPolicyHook.attest() → IERC1155`, `.policyId() → uint256`
  - `IVerifierHelper` (view subset of `VerifierHelper`), `IRootVerifier.verify(params) → (bool, bytes32, IVerifierHelper)`

- [ ] **Step 1: Write `src/interfaces/IValidationHook.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

/// @notice Uniswap CCA validation hook interface (Uniswap/continuous-clearing-auction).
interface IValidationHook {
    /// @notice Validate a bid; MUST revert if the bid is invalid
    function validate(uint256 maxPrice, uint128 amount, address owner, address sender, bytes calldata hookData)
        external;
}
```

- [ ] **Step 2: Write `src/interfaces/IPolicyHookViews.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

/// @notice Getter shape of Uniswap's stock BaseERC1155ValidationHook, for backend introspection.
interface IBaseERC1155ValidationHook {
    function erc1155() external view returns (IERC1155);
    function tokenId() external view returns (uint256);
}

/// @notice ZKPassport-specific introspection: resolves the attest registry and policy id.
interface IZKPassportPolicyHook {
    function attest() external view returns (IERC1155);
    function policyId() external view returns (uint256);
}
```

- [ ] **Step 3: Write `src/interfaces/IRootVerifier.sol`**

Declared `view` (not `pure`) so storage-backed mocks can implement it; the real
`VerifierHelper`'s `pure` functions satisfy it at the ABI level.

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";

interface IVerifierHelper {
    function getBoundData(bytes calldata committedInputs) external view returns (BoundData memory);
    function isAgeAboveOrEqual(uint8 minAge, bytes calldata committedInputs) external view returns (bool);
    function isNationalityOut(string[] memory countryList, bytes calldata committedInputs)
        external
        view
        returns (bool);
    function enforceSanctionsRoot(uint256 currentTimestamp, bool isStrict, bytes calldata committedInputs)
        external
        view;
    function verifyScopes(bytes32[] calldata publicInputs, string calldata scope, string calldata subscope)
        external
        view
        returns (bool);
    function getProofTimestamp(bytes32[] calldata publicInputs) external view returns (uint256);
}

interface IRootVerifier {
    function verify(ProofVerificationParams calldata params)
        external
        view
        returns (bool valid, bytes32 uniqueIdentifier, IVerifierHelper helper);
}
```

- [ ] **Step 4: Verify it builds**

```bash
forge build
```

Expected: success (compiles `@registry/lib/Types.sol` through the remapping — this proves the sibling remapping works).

- [ ] **Step 5: Commit**

```bash
git add src/interfaces/IValidationHook.sol src/interfaces/IPolicyHookViews.sol src/interfaces/IRootVerifier.sol
git commit -m "feat(attest-contracts): Add hook and verifier interfaces"
```

---

### Task 3: PolicyValidationHook

**Files:**
- Create: `src/PolicyValidationHook.sol`
- Test: `test/PolicyValidationHook.t.sol`

**Interfaces:**
- Consumes: Task 2 interfaces.
- Produces: `PolicyValidationHook` with `constructor(IERC1155 _erc1155, uint256 _tokenId)`, errors `NotOwnerOfERC1155Token(uint256)` and `SenderNotOwner()`, ERC-165 support. Task 4's `createPolicy` deploys it; Task 9 drives it through `MockAuction`.

- [ ] **Step 1: Write the failing tests**

`test/PolicyValidationHook.t.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {PolicyValidationHook} from "../src/PolicyValidationHook.sol";
import {IValidationHook} from "../src/interfaces/IValidationHook.sol";
import {IBaseERC1155ValidationHook, IZKPassportPolicyHook} from "../src/interfaces/IPolicyHookViews.sol";

contract MockBalanceERC1155 {
    mapping(address => mapping(uint256 => uint256)) public balanceOf;

    function setBalance(address account, uint256 id, uint256 value) external {
        balanceOf[account][id] = value;
    }
}

contract PolicyValidationHookTest is Test {
    MockBalanceERC1155 internal token;
    PolicyValidationHook internal hook;
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    uint256 internal constant POLICY_ID = 42;

    function setUp() public {
        token = new MockBalanceERC1155();
        hook = new PolicyValidationHook(IERC1155(address(token)), POLICY_ID);
    }

    function testValidatePassesWithCredential() public {
        token.setBalance(alice, POLICY_ID, 1);
        hook.validate(1e18, 100, alice, alice, "");
    }

    function testValidateRevertsWithoutCredential() public {
        vm.expectRevert(abi.encodeWithSelector(PolicyValidationHook.NotOwnerOfERC1155Token.selector, POLICY_ID));
        hook.validate(1e18, 100, alice, alice, "");
    }

    function testValidateRevertsWhenSenderIsNotOwner() public {
        token.setBalance(alice, POLICY_ID, 1);
        vm.expectRevert(PolicyValidationHook.SenderNotOwner.selector);
        hook.validate(1e18, 100, alice, bob, "");
    }

    function testExposesTokenAndPolicyGetters() public view {
        assertEq(address(hook.erc1155()), address(token));
        assertEq(hook.tokenId(), POLICY_ID);
        assertEq(address(hook.attest()), address(token));
        assertEq(hook.policyId(), POLICY_ID);
    }

    function testSupportsExpectedInterfaces() public view {
        assertTrue(hook.supportsInterface(type(IValidationHook).interfaceId));
        assertTrue(hook.supportsInterface(type(IBaseERC1155ValidationHook).interfaceId));
        assertTrue(hook.supportsInterface(type(IZKPassportPolicyHook).interfaceId));
        assertTrue(hook.supportsInterface(type(IERC165).interfaceId));
        assertFalse(hook.supportsInterface(0xffffffff));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
forge test --match-path test/PolicyValidationHook.t.sol -vvv
```

Expected: compilation failure — `PolicyValidationHook` does not exist.

- [ ] **Step 3: Write `src/PolicyValidationHook.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IValidationHook} from "./interfaces/IValidationHook.sol";
import {IBaseERC1155ValidationHook, IZKPassportPolicyHook} from "./interfaces/IPolicyHookViews.sol";

/**
 * @title  PolicyValidationHook
 * @notice Perpetual Uniswap CCA validation hook gating bids on an attest credential
 */
contract PolicyValidationHook is IValidationHook, IBaseERC1155ValidationHook, IZKPassportPolicyHook, IERC165 {
    error NotOwnerOfERC1155Token(uint256 tokenId);
    error SenderNotOwner();
    error InvalidTokenAddress();

    IERC1155 public immutable erc1155;
    uint256 public immutable tokenId;

    constructor(IERC1155 _erc1155, uint256 _tokenId) {
        if (address(_erc1155) == address(0)) revert InvalidTokenAddress();
        erc1155 = _erc1155;
        tokenId = _tokenId;
    }

    /// @notice Reverts unless the bid owner is the sender and holds a valid credential
    function validate(uint256, uint128, address owner, address sender, bytes calldata) external view {
        if (sender != owner) revert SenderNotOwner();
        if (erc1155.balanceOf(owner, tokenId) == 0) revert NotOwnerOfERC1155Token(tokenId);
    }

    /// @notice The attest registry this hook reads
    function attest() external view returns (IERC1155) {
        return erc1155;
    }

    /// @notice The policy id this hook gates on
    function policyId() external view returns (uint256) {
        return tokenId;
    }

    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == type(IValidationHook).interfaceId
            || interfaceId == type(IBaseERC1155ValidationHook).interfaceId
            || interfaceId == type(IZKPassportPolicyHook).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
forge test --match-path test/PolicyValidationHook.t.sol -vvv
```

Expected: 5 tests PASS.

- [ ] **Step 5: Format and commit**

```bash
forge fmt
git add src/PolicyValidationHook.sol test/PolicyValidationHook.t.sol
git commit -m "feat(attest-contracts): Add per-policy validation hook"
```

---

### Task 4: ZKPassportAttest — policy creation and metadata

**Files:**
- Create: `src/ZKPassportAttest.sol`
- Test: `test/ZKPassportAttest.policies.t.sol`
- Create: `test/AttestTestBase.sol`

**Interfaces:**
- Consumes: `PolicyValidationHook` (Task 3), `IRootVerifier` (Task 2).
- Produces (relied on by Tasks 5–10):
  - `constructor(IRootVerifier _rootVerifier, string memory _domain, address _admin, address _guardian)`
  - `createPolicy(bytes32 salt, uint64 validityPeriod, bool unique, uint8 minAge, bool sanctionsCheck, string[] calldata excludedCountries, string calldata metadataURL) → uint256 policyId`
  - `getPolicy(uint256) → Policy` (struct with fields `owner, validityPeriod, unique, minAge, sanctionsCheck, excludedCountries, metadataURL, hook`)
  - `setMetadataURL(uint256 policyId, string calldata url)`, `uri(uint256) → string`
  - `policyScope(uint256) → string` (`"attest:0x…64 hex…"`)
  - Event `PolicyCreated(uint256 indexed policyId, address indexed owner, address hook)`

- [ ] **Step 1: Write the shared test base**

`test/AttestTestBase.sol` (mocks arrive in Task 5; the base starts minimal and Task 5 extends it):

```solidity
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
        return attest.createPolicy(bytes32(uint256(1)), 30 days, false, 0, false, noCountries, "https://policy.example/1");
    }
}
```

- [ ] **Step 2: Write the failing policy tests**

`test/ZKPassportAttest.policies.t.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";
import {IRootVerifier} from "../src/interfaces/IRootVerifier.sol";
import {PolicyValidationHook} from "../src/PolicyValidationHook.sol";

contract ZKPassportAttestPoliciesTest is AttestTestBase {
    function setUp() public {
        _deployAttest(IRootVerifier(makeAddr("verifier")));
    }

    function testCreatePolicyDerivesIdFromOwnerAndSalt() public {
        uint256 policyId = _createDefaultPolicy();
        assertEq(policyId, uint256(keccak256(abi.encode(creator, bytes32(uint256(1))))));
    }

    function testCreatePolicyStoresFieldsAndDeploysHook() public {
        string[] memory excluded = new string[](1);
        excluded[0] = "PRK";
        vm.prank(creator);
        uint256 policyId = attest.createPolicy(bytes32(0), 7 days, true, 18, true, excluded, "https://policy.example/kyc");
        ZKPassportAttest.Policy memory policy = attest.getPolicy(policyId);
        assertEq(policy.owner, creator);
        assertEq(policy.validityPeriod, 7 days);
        assertTrue(policy.unique);
        assertEq(policy.minAge, 18);
        assertTrue(policy.sanctionsCheck);
        assertEq(policy.excludedCountries.length, 1);
        assertEq(policy.metadataURL, "https://policy.example/kyc");
        PolicyValidationHook hook = PolicyValidationHook(policy.hook);
        assertEq(address(hook.erc1155()), address(attest));
        assertEq(hook.tokenId(), policyId);
    }

    function testCreatePolicyEmitsEvent() public {
        uint256 expectedId = uint256(keccak256(abi.encode(creator, bytes32(uint256(1)))));
        vm.expectEmit(true, true, false, false);
        emit ZKPassportAttest.PolicyCreated(expectedId, creator, address(0));
        _createDefaultPolicy();
    }

    function testCreatePolicyRevertsOnDuplicateSalt() public {
        _createDefaultPolicy();
        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(
                ZKPassportAttest.Attest__PolicyAlreadyExists.selector,
                uint256(keccak256(abi.encode(creator, bytes32(uint256(1)))))
            )
        );
        attest.createPolicy(bytes32(uint256(1)), 30 days, false, 0, false, noCountries, "other");
    }

    function testSameSaltDifferentOwnersDifferentIds() public {
        uint256 first = _createDefaultPolicy();
        address other = makeAddr("other");
        vm.prank(other);
        uint256 second = attest.createPolicy(bytes32(uint256(1)), 30 days, false, 0, false, noCountries, "x");
        assertTrue(first != second);
    }

    function testCreatePolicyRevertsOnZeroValidityPeriod() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportAttest.Attest__InvalidValidityPeriod.selector);
        attest.createPolicy(bytes32(0), 0, false, 0, false, noCountries, "x");
    }

    function testUriReturnsMetadataURL() public {
        uint256 policyId = _createDefaultPolicy();
        assertEq(attest.uri(policyId), "https://policy.example/1");
    }

    function testOnlyPolicyOwnerCanSetMetadataURL() public {
        uint256 policyId = _createDefaultPolicy();
        vm.prank(creator);
        attest.setMetadataURL(policyId, "https://policy.example/updated");
        assertEq(attest.uri(policyId), "https://policy.example/updated");

        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.Attest__NotPolicyOwner.selector);
        attest.setMetadataURL(policyId, "https://evil.example");
    }

    function testGetPolicyRevertsWhenUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(ZKPassportAttest.Attest__PolicyNotFound.selector, uint256(123)));
        attest.getPolicy(123);
    }

    function testPolicyScopeFormat() public {
        uint256 policyId = _createDefaultPolicy();
        string memory scope = attest.policyScope(policyId);
        assertEq(bytes(scope).length, 7 + 66);
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
forge test --match-path test/ZKPassportAttest.policies.t.sol -vvv
```

Expected: compilation failure — `ZKPassportAttest` does not exist.

- [ ] **Step 4: Write `src/ZKPassportAttest.sol` (policy surface only)**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IRootVerifier} from "./interfaces/IRootVerifier.sol";
import {PolicyValidationHook} from "./PolicyValidationHook.sol";

/**
 * @title  ZKPassportAttest
 * @notice Soulbound ERC-1155 credential registry: one tokenId per policy,
 *         balance 1 while the credential is unexpired
 */
contract ZKPassportAttest is ERC1155 {
    struct Policy {
        address owner;
        uint64 validityPeriod;
        bool unique;
        uint8 minAge;
        bool sanctionsCheck;
        string[] excludedCountries;
        string metadataURL;
        address hook;
    }

    error Attest__PolicyNotFound(uint256 policyId);
    error Attest__PolicyAlreadyExists(uint256 policyId);
    error Attest__InvalidValidityPeriod();
    error Attest__NotPolicyOwner();

    event PolicyCreated(uint256 indexed policyId, address indexed owner, address hook);
    event PolicyMetadataURLUpdated(uint256 indexed policyId, string url);

    IRootVerifier public immutable rootVerifier;
    string public domain;
    address public admin;
    address public guardian;

    mapping(uint256 policyId => Policy) internal _policies;

    constructor(IRootVerifier _rootVerifier, string memory _domain, address _admin, address _guardian) ERC1155("") {
        rootVerifier = _rootVerifier;
        domain = _domain;
        admin = _admin;
        guardian = _guardian;
    }

    /// @notice Create a policy; the id is namespaced by creator and salt and stable across chains
    function createPolicy(
        bytes32 salt,
        uint64 validityPeriod,
        bool unique,
        uint8 minAge,
        bool sanctionsCheck,
        string[] calldata excludedCountries,
        string calldata metadataURL
    ) external returns (uint256 policyId) {
        if (validityPeriod == 0) revert Attest__InvalidValidityPeriod();
        policyId = uint256(keccak256(abi.encode(msg.sender, salt)));
        if (_policies[policyId].owner != address(0)) revert Attest__PolicyAlreadyExists(policyId);

        address hook = address(new PolicyValidationHook{salt: bytes32(policyId)}(IERC1155(address(this)), policyId));

        Policy storage policy = _policies[policyId];
        policy.owner = msg.sender;
        policy.validityPeriod = validityPeriod;
        policy.unique = unique;
        policy.minAge = minAge;
        policy.sanctionsCheck = sanctionsCheck;
        policy.excludedCountries = excludedCountries;
        policy.metadataURL = metadataURL;
        policy.hook = hook;

        emit PolicyCreated(policyId, msg.sender, hook);
    }

    /// @notice Full policy struct; reverts for unknown ids
    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        Policy memory policy = _policies[policyId];
        if (policy.owner == address(0)) revert Attest__PolicyNotFound(policyId);
        return policy;
    }

    /// @notice Update the display metadata URL; predicates are immutable
    function setMetadataURL(uint256 policyId, string calldata url) external {
        if (_policies[policyId].owner != msg.sender) revert Attest__NotPolicyOwner();
        _policies[policyId].metadataURL = url;
        emit PolicyMetadataURLUpdated(policyId, url);
    }

    function uri(uint256 policyId) public view override returns (string memory) {
        return _policies[policyId].metadataURL;
    }

    /// @notice The proof subscope a credential for this policy must be generated with
    function policyScope(uint256 policyId) public pure returns (string memory) {
        return string.concat("attest:", Strings.toHexString(policyId, 32));
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
forge test --match-path test/ZKPassportAttest.policies.t.sol -vvv
```

Expected: 10 tests PASS.

- [ ] **Step 6: Format and commit**

```bash
forge fmt
git add src/ZKPassportAttest.sol test/ZKPassportAttest.policies.t.sol test/AttestTestBase.sol
git commit -m "feat(attest-contracts): Add policy creation, metadata, and hook deployment"
```

---

### Task 5: Verifier mocks and issue() verification gauntlet

**Files:**
- Create: `test/mocks/MockVerifier.sol`
- Modify: `test/AttestTestBase.sol` (add mock wiring + params builder)
- Modify: `src/ZKPassportAttest.sol` (add `issue`, `heldUntil`, errors, events)
- Test: `test/ZKPassportAttest.issue.t.sol`

**Interfaces:**
- Consumes: `IRootVerifier`/`IVerifierHelper` (Task 2), policy surface (Task 4).
- Produces (relied on by Tasks 6–9):
  - `issue(address wallet, uint256 policyId, ProofVerificationParams calldata params)`
  - `heldUntil(address, uint256) → uint64` public mapping getter
  - `MockVerifierHelper` setters: `setBoundData(address,uint256,string)`, `setAgeOk(bool)`, `setNationalityOk(bool)`, `setSanctionsOk(bool)`, `setScopesOk(bool)`, `setProofTimestamp(uint256)`
  - `MockRootVerifier` setters: `setValid(bool)`, `setNullifier(bytes32)`
  - `AttestTestBase._params() → ProofVerificationParams memory` (devMode false, empty proof)
  - Events `CredentialIssued(address indexed wallet, uint256 indexed policyId, uint64 heldUntil)` / `CredentialRenewed(...)` (same shape)

- [ ] **Step 1: Write the mocks**

`test/mocks/MockVerifier.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IRootVerifier, IVerifierHelper} from "../../src/interfaces/IRootVerifier.sol";

contract MockVerifierHelper is IVerifierHelper {
    BoundData internal _boundData;
    bool public ageOk = true;
    bool public nationalityOk = true;
    bool public sanctionsOk = true;
    bool public scopesOk = true;
    uint256 public proofTimestamp;

    function setBoundData(address senderAddress, uint256 chainId, string memory customData) external {
        _boundData = BoundData({senderAddress: senderAddress, chainId: chainId, customData: customData});
    }

    function setAgeOk(bool value) external {
        ageOk = value;
    }

    function setNationalityOk(bool value) external {
        nationalityOk = value;
    }

    function setSanctionsOk(bool value) external {
        sanctionsOk = value;
    }

    function setScopesOk(bool value) external {
        scopesOk = value;
    }

    function setProofTimestamp(uint256 value) external {
        proofTimestamp = value;
    }

    function getBoundData(bytes calldata) external view returns (BoundData memory) {
        return _boundData;
    }

    function isAgeAboveOrEqual(uint8, bytes calldata) external view returns (bool) {
        return ageOk;
    }

    function isNationalityOut(string[] memory, bytes calldata) external view returns (bool) {
        return nationalityOk;
    }

    function enforceSanctionsRoot(uint256, bool, bytes calldata) external view {
        require(sanctionsOk, "MockVerifierHelper: sanctions root invalid");
    }

    function verifyScopes(bytes32[] calldata, string calldata, string calldata) external view returns (bool) {
        return scopesOk;
    }

    function getProofTimestamp(bytes32[] calldata) external view returns (uint256) {
        return proofTimestamp;
    }
}

contract MockRootVerifier is IRootVerifier {
    MockVerifierHelper public immutable helper;
    bool public valid = true;
    bytes32 public nullifier = bytes32(uint256(0xA11CE));

    constructor(MockVerifierHelper _helper) {
        helper = _helper;
    }

    function setValid(bool value) external {
        valid = value;
    }

    function setNullifier(bytes32 value) external {
        nullifier = value;
    }

    function verify(ProofVerificationParams calldata) external view returns (bool, bytes32, IVerifierHelper) {
        return (valid, nullifier, helper);
    }
}
```

- [ ] **Step 2: Extend `test/AttestTestBase.sol`**

Replace its contents with:

```solidity
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
        return attest.createPolicy(bytes32(uint256(1)), 30 days, false, 0, false, noCountries, "https://policy.example/1");
    }

    function _params() internal pure returns (ProofVerificationParams memory) {
        return ProofVerificationParams({
            version: bytes32(uint256(1)),
            proofVerificationData: ProofVerificationData({vkeyHash: bytes32(0), proof: "", publicInputs: new bytes32[](0)}),
            committedInputs: "",
            serviceConfig: ServiceConfig({validityPeriodInSeconds: 0, domain: "zkpassport.id", scope: "", devMode: false})
        });
    }

    function _devModeParams() internal pure returns (ProofVerificationParams memory params) {
        params = _params();
        params.serviceConfig.devMode = true;
    }
}
```

- [ ] **Step 3: Write the failing issue() tests**

`test/ZKPassportAttest.issue.t.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";

contract ZKPassportAttestIssueTest is AttestTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
    }

    function testIssueGrantsCredential() public {
        vm.expectEmit(true, true, false, true);
        emit ZKPassportAttest.CredentialIssued(wallet, policyId, uint64(block.timestamp + 30 days));
        attest.issue(wallet, policyId, _params());
        assertEq(attest.heldUntil(wallet, policyId), uint64(block.timestamp + 30 days));
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testIssueIsPermissionlessForTheCaller() public {
        vm.prank(makeAddr("sponsor"));
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsForUnknownPolicy() public {
        vm.expectRevert(abi.encodeWithSelector(ZKPassportAttest.Attest__PolicyNotFound.selector, uint256(999)));
        attest.issue(wallet, 999, _params());
    }

    function testIssueRevertsOnDevMode() public {
        vm.expectRevert(ZKPassportAttest.Attest__DevModeNotAllowed.selector);
        attest.issue(wallet, policyId, _devModeParams());
    }

    function testIssueRevertsOnInvalidProof() public {
        mockVerifier.setValid(false);
        vm.expectRevert(ZKPassportAttest.Attest__InvalidProof.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnWrongScope() public {
        mockHelper.setScopesOk(false);
        vm.expectRevert(ZKPassportAttest.Attest__WrongScope.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnStaleProof() public {
        mockHelper.setProofTimestamp(block.timestamp - 1 hours - 1);
        vm.expectRevert(ZKPassportAttest.Attest__StaleProof.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueAcceptsProofAtFreshnessBoundary() public {
        mockHelper.setProofTimestamp(block.timestamp - 1 hours);
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testIssueRevertsWhenBoundToOtherWallet() public {
        mockHelper.setBoundData(makeAddr("mallory"), block.chainid, "");
        vm.expectRevert(ZKPassportAttest.Attest__ProofNotBoundToWallet.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueRevertsWhenBoundToOtherChain() public {
        mockHelper.setBoundData(wallet, block.chainid + 1, "");
        vm.expectRevert(ZKPassportAttest.Attest__ProofNotBoundToChain.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testIssueRevertsOnUnexpectedCustomData() public {
        mockHelper.setBoundData(wallet, block.chainid, "extra");
        vm.expectRevert(ZKPassportAttest.Attest__UnexpectedBoundData.selector);
        attest.issue(wallet, policyId, _params());
    }
}
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
forge test --match-path test/ZKPassportAttest.issue.t.sol -vvv
```

Expected: compilation failure — `issue`, `heldUntil`, and the new errors do not exist yet.

- [ ] **Step 5: Add the issue() core to `src/ZKPassportAttest.sol`**

Add imports:

```solidity
import {BoundData, ProofVerificationParams} from "@registry/lib/Types.sol";
import {IVerifierHelper} from "./interfaces/IRootVerifier.sol";
```

Add errors/events/state alongside the existing ones:

```solidity
    error Attest__DevModeNotAllowed();
    error Attest__InvalidProof();
    error Attest__WrongScope();
    error Attest__StaleProof();
    error Attest__ProofNotBoundToWallet();
    error Attest__ProofNotBoundToChain();
    error Attest__UnexpectedBoundData();

    event CredentialIssued(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);
    event CredentialRenewed(address indexed wallet, uint256 indexed policyId, uint64 heldUntil);

    uint256 public constant PROOF_FRESHNESS = 1 hours;

    mapping(address wallet => mapping(uint256 policyId => uint64)) public heldUntil;
```

Add the function:

```solidity
    /// @notice Verify a proof and grant (or extend) the wallet's credential for a policy.
    ///         Anyone may pay the gas; the proof itself pins the recipient wallet and chain.
    function issue(address wallet, uint256 policyId, ProofVerificationParams calldata params) external {
        Policy storage policy = _policies[policyId];
        if (policy.owner == address(0)) revert Attest__PolicyNotFound(policyId);
        if (params.serviceConfig.devMode) revert Attest__DevModeNotAllowed();

        (bool valid, bytes32 nullifier, IVerifierHelper helper) = rootVerifier.verify(params);
        if (!valid) revert Attest__InvalidProof();

        if (!helper.verifyScopes(params.proofVerificationData.publicInputs, domain, policyScope(policyId))) {
            revert Attest__WrongScope();
        }
        if (helper.getProofTimestamp(params.proofVerificationData.publicInputs) + PROOF_FRESHNESS < block.timestamp) {
            revert Attest__StaleProof();
        }

        BoundData memory bound = helper.getBoundData(params.committedInputs);
        if (bound.senderAddress != wallet) revert Attest__ProofNotBoundToWallet();
        if (bound.chainId != block.chainid) revert Attest__ProofNotBoundToChain();
        if (bytes(bound.customData).length != 0) revert Attest__UnexpectedBoundData();

        _enforcePredicates(policy, helper, params.committedInputs);
        _consumeNullifier(policy, policyId, nullifier, wallet);

        bool firstIssue = heldUntil[wallet][policyId] == 0;
        uint64 newHeldUntil = uint64(block.timestamp + policy.validityPeriod);
        heldUntil[wallet][policyId] = newHeldUntil;
        if (super.balanceOf(wallet, policyId) == 0) {
            _mint(wallet, policyId, 1, "");
        }
        if (firstIssue) {
            emit CredentialIssued(wallet, policyId, newHeldUntil);
        } else {
            emit CredentialRenewed(wallet, policyId, newHeldUntil);
        }
    }

    function _enforcePredicates(Policy storage policy, IVerifierHelper helper, bytes calldata committedInputs)
        internal
        view
    {}

    function _consumeNullifier(Policy storage policy, uint256 policyId, bytes32 nullifier, address wallet) internal {}
```

The two internal hooks stay empty until Task 6 fills them (they compile and keep this task's tests green).

- [ ] **Step 6: Run tests to verify they pass**

```bash
forge test --match-path test/ZKPassportAttest.issue.t.sol -vvv
```

Expected: 11 tests PASS. Also run `forge test` — Task 4's suite must stay green.

- [ ] **Step 7: Format and commit**

```bash
forge fmt
git add src/ZKPassportAttest.sol test/ZKPassportAttest.issue.t.sol test/AttestTestBase.sol test/mocks/MockVerifier.sol
git commit -m "feat(attest-contracts): Add credential issuance with proof binding checks"
```

---

### Task 6: Predicates and nullifier uniqueness

**Files:**
- Modify: `src/ZKPassportAttest.sol` (fill `_enforcePredicates`, `_consumeNullifier`)
- Test: `test/ZKPassportAttest.predicates.t.sol`

**Interfaces:**
- Consumes: Task 5's mocks and `issue()`.
- Produces: errors `Attest__AgeBelowMinimum`, `Attest__ExcludedJurisdiction`, `Attest__SybilDetected(bytes32)`, `Attest__MissingNullifier`; public mapping `nullifierWallet(uint256, bytes32) → address`.

- [ ] **Step 1: Write the failing tests**

`test/ZKPassportAttest.predicates.t.sol`:

```solidity
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
        vm.expectRevert(ZKPassportAttest.Attest__AgeBelowMinimum.selector);
        attest.issue(wallet, strictPolicyId, _params());
    }

    function testIssueRevertsOnExcludedJurisdiction() public {
        mockHelper.setNationalityOk(false);
        vm.expectRevert(ZKPassportAttest.Attest__ExcludedJurisdiction.selector);
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
            abi.encodeWithSelector(ZKPassportAttest.Attest__SybilDetected.selector, mockVerifier.nullifier())
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
        vm.expectRevert(ZKPassportAttest.Attest__MissingNullifier.selector);
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
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
forge test --match-path test/ZKPassportAttest.predicates.t.sol -vvv
```

Expected: compilation failure on the new error/mapping names, or predicate tests FAIL (empty hooks enforce nothing).

- [ ] **Step 3: Fill in the internal hooks in `src/ZKPassportAttest.sol`**

Add errors and state:

```solidity
    error Attest__AgeBelowMinimum();
    error Attest__ExcludedJurisdiction();
    error Attest__SybilDetected(bytes32 nullifier);
    error Attest__MissingNullifier();

    mapping(uint256 policyId => mapping(bytes32 nullifier => address wallet)) public nullifierWallet;
```

Replace the two empty functions:

```solidity
    function _enforcePredicates(Policy storage policy, IVerifierHelper helper, bytes calldata committedInputs)
        internal
        view
    {
        if (policy.minAge > 0 && !helper.isAgeAboveOrEqual(policy.minAge, committedInputs)) {
            revert Attest__AgeBelowMinimum();
        }
        if (policy.excludedCountries.length > 0 && !helper.isNationalityOut(policy.excludedCountries, committedInputs)) {
            revert Attest__ExcludedJurisdiction();
        }
        if (policy.sanctionsCheck) {
            helper.enforceSanctionsRoot(block.timestamp, true, committedInputs);
        }
    }

    function _consumeNullifier(Policy storage policy, uint256 policyId, bytes32 nullifier, address wallet) internal {
        if (!policy.unique) return;
        if (nullifier == bytes32(0)) revert Attest__MissingNullifier();
        address prior = nullifierWallet[policyId][nullifier];
        if (prior != address(0) && prior != wallet) revert Attest__SybilDetected(nullifier);
        nullifierWallet[policyId][nullifier] = wallet;
    }
```

- [ ] **Step 4: Run the full suite**

```bash
forge test -vvv
```

Expected: all tests PASS (Tasks 3–6 suites).

- [ ] **Step 5: Format and commit**

```bash
forge fmt
git add src/ZKPassportAttest.sol test/ZKPassportAttest.predicates.t.sol
git commit -m "feat(attest-contracts): Enforce policy predicates and per-policy nullifiers"
```

---

### Task 7: Expiry semantics, soulbound behavior, and revocation

**Files:**
- Modify: `src/ZKPassportAttest.sol` (add `balanceOf`/`_update`/`setApprovalForAll` overrides, `revoke`)
- Test: `test/ZKPassportAttest.credential.t.sol`

**Interfaces:**
- Consumes: Tasks 4–6.
- Produces: `balanceOf(address, uint256)` masking by `heldUntil`; `revoke(address wallet, uint256 policyId)` (holder or guardian); errors `Attest__TokenIsSoulbound`, `Attest__NotRevocable`, `Attest__NothingToRevoke`; event `CredentialRevoked(address indexed wallet, uint256 indexed policyId, address by)`. Task 9 relies on `balanceOf` returning 0 after expiry.

- [ ] **Step 1: Write the failing tests**

`test/ZKPassportAttest.credential.t.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";

contract ZKPassportAttestCredentialTest is AttestTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
        attest.issue(wallet, policyId, _params());
    }

    function testBalanceIsOneUntilHeldUntilInclusive() public {
        vm.warp(uint256(attest.heldUntil(wallet, policyId)));
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testBalanceIsZeroAfterExpiry() public {
        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        assertEq(attest.balanceOf(wallet, policyId), 0);
    }

    function testRenewAfterExpiryExtendsWithoutDoubleMint() public {
        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        mockHelper.setProofTimestamp(block.timestamp);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportAttest.CredentialRenewed(wallet, policyId, uint64(block.timestamp + 30 days));
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testTransfersRevert() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.Attest__TokenIsSoulbound.selector);
        attest.safeTransferFrom(wallet, makeAddr("receiver"), policyId, 1, "");
    }

    function testBatchTransfersRevert() public {
        uint256[] memory ids = new uint256[](1);
        ids[0] = policyId;
        uint256[] memory values = new uint256[](1);
        values[0] = 1;
        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.Attest__TokenIsSoulbound.selector);
        attest.safeBatchTransferFrom(wallet, makeAddr("receiver"), ids, values, "");
    }

    function testApprovalsRevert() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.Attest__TokenIsSoulbound.selector);
        attest.setApprovalForAll(makeAddr("operator"), true);
    }

    function testHolderCanRevokeSelf() public {
        vm.prank(wallet);
        vm.expectEmit(true, true, false, true);
        emit ZKPassportAttest.CredentialRevoked(wallet, policyId, wallet);
        attest.revoke(wallet, policyId);
        assertEq(attest.balanceOf(wallet, policyId), 0);
        assertEq(attest.heldUntil(wallet, policyId), 0);
    }

    function testGuardianCanRevoke() public {
        vm.prank(guardian);
        attest.revoke(wallet, policyId);
        assertEq(attest.balanceOf(wallet, policyId), 0);
    }

    function testPolicyOwnerCannotRevoke() public {
        vm.prank(creator);
        vm.expectRevert(ZKPassportAttest.Attest__NotRevocable.selector);
        attest.revoke(wallet, policyId);
    }

    function testRevokeWithoutCredentialReverts() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert(ZKPassportAttest.Attest__NothingToRevoke.selector);
        attest.revoke(stranger, policyId);
    }

    function testReissueAfterRevokeWorks() public {
        vm.prank(wallet);
        attest.revoke(wallet, policyId);
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
forge test --match-path test/ZKPassportAttest.credential.t.sol -vvv
```

Expected: compilation failure (`revoke`, soulbound error missing); once stubs exist, expiry tests FAIL against stock OZ `balanceOf`.

- [ ] **Step 3: Add overrides and revoke to `src/ZKPassportAttest.sol`**

Errors and event:

```solidity
    error Attest__TokenIsSoulbound();
    error Attest__NotRevocable();
    error Attest__NothingToRevoke();

    event CredentialRevoked(address indexed wallet, uint256 indexed policyId, address by);
```

Functions:

```solidity
    /// @notice 1 while the wallet holds an unexpired credential for the policy, else 0
    function balanceOf(address account, uint256 id) public view override returns (uint256) {
        return heldUntil[account][id] >= block.timestamp ? 1 : 0;
    }

    /// @notice Remove a credential; only the holder or the ZKPassport guardian, never the policy owner
    function revoke(address wallet, uint256 policyId) external {
        if (msg.sender != wallet && msg.sender != guardian) revert Attest__NotRevocable();
        if (heldUntil[wallet][policyId] == 0) revert Attest__NothingToRevoke();
        heldUntil[wallet][policyId] = 0;
        if (super.balanceOf(wallet, policyId) > 0) {
            _burn(wallet, policyId, 1);
        }
        emit CredentialRevoked(wallet, policyId, msg.sender);
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Attest__TokenIsSoulbound();
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values) internal override {
        if (from != address(0) && to != address(0)) revert Attest__TokenIsSoulbound();
        super._update(from, to, ids, values);
    }
```

Note: `safeTransferFrom` reaches `_update` only after OZ's approval check; the
holder transferring their own token needs no approval, so the soulbound revert
fires. `revoke` after expiry still works because it checks `heldUntil`, not the
masked `balanceOf`.

- [ ] **Step 4: Run the full suite**

```bash
forge test -vvv
```

Expected: all tests PASS. Watch specifically that Task 5's `testIssueGrantsCredential` still passes with the new `balanceOf` (it should — freshly issued credentials satisfy `heldUntil >= block.timestamp`).

- [ ] **Step 5: Format and commit**

```bash
forge fmt
git add src/ZKPassportAttest.sol test/ZKPassportAttest.credential.t.sol
git commit -m "feat(attest-contracts): Add expiry-masked balance, soulbound overrides, and revocation"
```

---

### Task 8: Roles and pause

**Files:**
- Modify: `src/ZKPassportAttest.sol`
- Test: `test/ZKPassportAttest.admin.t.sol`

**Interfaces:**
- Consumes: Tasks 4–7.
- Produces: `pause()` (admin or guardian), `unpause()` (admin), `transferAdmin(address)`, `setGuardian(address)`, `paused() → bool`; errors `Attest__Paused`, `Attest__NotAuthorized`, `Attest__ZeroAddress`; events `PausedStatusChanged(bool)`, `AdminUpdated(address indexed, address indexed)`, `GuardianUpdated(address indexed, address indexed)`. `issue` gains the pause gate; `balanceOf`, `validate`, and `revoke` are never paused.

- [ ] **Step 1: Write the failing tests**

`test/ZKPassportAttest.admin.t.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";

contract ZKPassportAttestAdminTest is AttestTestBase {
    uint256 internal policyId;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
    }

    function testAdminAndGuardianCanPauseIssue() public {
        vm.prank(guardian);
        attest.pause();
        vm.expectRevert(ZKPassportAttest.Attest__Paused.selector);
        attest.issue(wallet, policyId, _params());
    }

    function testOthersCannotPause() public {
        vm.prank(wallet);
        vm.expectRevert(ZKPassportAttest.Attest__NotAuthorized.selector);
        attest.pause();
    }

    function testOnlyAdminCanUnpause() public {
        vm.prank(admin);
        attest.pause();
        vm.prank(guardian);
        vm.expectRevert(ZKPassportAttest.Attest__NotAuthorized.selector);
        attest.unpause();
        vm.prank(admin);
        attest.unpause();
        attest.issue(wallet, policyId, _params());
        assertEq(attest.balanceOf(wallet, policyId), 1);
    }

    function testPauseDoesNotAffectBalanceOfAndRevoke() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(admin);
        attest.pause();
        assertEq(attest.balanceOf(wallet, policyId), 1);
        vm.prank(wallet);
        attest.revoke(wallet, policyId);
        assertEq(attest.balanceOf(wallet, policyId), 0);
    }

    function testPauseDoesNotAffectCreatePolicy() public {
        vm.prank(admin);
        attest.pause();
        vm.prank(creator);
        attest.createPolicy(bytes32(uint256(99)), 1 days, false, 0, false, noCountries, "x");
    }

    function testTransferAdmin() public {
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        attest.transferAdmin(newAdmin);
        assertEq(attest.admin(), newAdmin);
        vm.prank(newAdmin);
        attest.pause();
    }

    function testSetGuardian() public {
        address newGuardian = makeAddr("newGuardian");
        vm.prank(admin);
        attest.setGuardian(newGuardian);
        assertEq(attest.guardian(), newGuardian);
    }

    function testCannotTransferAdminToZero() public {
        vm.prank(admin);
        vm.expectRevert(ZKPassportAttest.Attest__ZeroAddress.selector);
        attest.transferAdmin(address(0));
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
forge test --match-path test/ZKPassportAttest.admin.t.sol -vvv
```

Expected: compilation failure — `pause`, `unpause`, `transferAdmin`, `setGuardian` do not exist.

- [ ] **Step 3: Add roles to `src/ZKPassportAttest.sol`**

Errors, events, state:

```solidity
    error Attest__Paused();
    error Attest__NotAuthorized();
    error Attest__ZeroAddress();

    event PausedStatusChanged(bool paused);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event GuardianUpdated(address indexed oldGuardian, address indexed newGuardian);

    bool public paused;
```

In the constructor, require a non-zero admin:

```solidity
        if (_admin == address(0)) revert Attest__ZeroAddress();
```

At the top of `issue`:

```solidity
        if (paused) revert Attest__Paused();
```

Functions (mirroring `RootVerifier`'s role split):

```solidity
    /// @notice Emergency stop for issuance; reads and revocation stay live
    function pause() external {
        if (msg.sender != admin && msg.sender != guardian) revert Attest__NotAuthorized();
        paused = true;
        emit PausedStatusChanged(true);
    }

    function unpause() external {
        if (msg.sender != admin) revert Attest__NotAuthorized();
        paused = false;
        emit PausedStatusChanged(false);
    }

    function transferAdmin(address newAdmin) external {
        if (msg.sender != admin) revert Attest__NotAuthorized();
        if (newAdmin == address(0)) revert Attest__ZeroAddress();
        emit AdminUpdated(admin, newAdmin);
        admin = newAdmin;
    }

    function setGuardian(address newGuardian) external {
        if (msg.sender != admin) revert Attest__NotAuthorized();
        emit GuardianUpdated(guardian, newGuardian);
        guardian = newGuardian;
    }
```

- [ ] **Step 4: Run the full suite**

```bash
forge test -vvv
```

Expected: all tests PASS.

- [ ] **Step 5: Format and commit**

```bash
forge fmt
git add src/ZKPassportAttest.sol test/ZKPassportAttest.admin.t.sol
git commit -m "feat(attest-contracts): Add admin and guardian roles with issuance pause"
```

---

### Task 9: MockAuction and end-to-end hook integration

**Files:**
- Create: `src/mocks/MockAuction.sol`
- Test: `test/Integration.t.sol`

**Interfaces:**
- Consumes: everything above.
- Produces: `MockAuction(IValidationHook hook)` with `submitBid(uint256 maxPrice, uint128 amount, address owner, bytes calldata hookData)` calling `validate(maxPrice, amount, owner, msg.sender, hookData)` before accepting — `_submitBid`'s exact semantics. Reused by the demo dapp (PR 5).

- [ ] **Step 1: Write the failing integration test**

`test/Integration.t.sol`:

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {AttestTestBase} from "./AttestTestBase.sol";
import {MockAuction} from "../src/mocks/MockAuction.sol";
import {PolicyValidationHook} from "../src/PolicyValidationHook.sol";
import {IValidationHook} from "../src/interfaces/IValidationHook.sol";

contract IntegrationTest is AttestTestBase {
    uint256 internal policyId;
    MockAuction internal auction;

    function setUp() public {
        vm.warp(1_700_000_000);
        _deployWithMocks();
        policyId = _createDefaultPolicy();
        auction = new MockAuction(IValidationHook(attest.getPolicy(policyId).hook));
    }

    function testGatedBidRevertsWithoutCredential() public {
        vm.prank(wallet);
        vm.expectRevert(abi.encodeWithSelector(PolicyValidationHook.NotOwnerOfERC1155Token.selector, policyId));
        auction.submitBid(1e18, 100, wallet, "");
    }

    function testBidPassesAfterCredentialMint() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(wallet);
        auction.submitBid(1e18, 100, wallet, "");
        assertEq(auction.bidCount(), 1);
    }

    function testBidRevertsAgainAfterExpiry() public {
        attest.issue(wallet, policyId, _params());
        vm.warp(uint256(attest.heldUntil(wallet, policyId)) + 1);
        vm.prank(wallet);
        vm.expectRevert(abi.encodeWithSelector(PolicyValidationHook.NotOwnerOfERC1155Token.selector, policyId));
        auction.submitBid(1e18, 100, wallet, "");
    }

    function testBidOnBehalfOfOtherOwnerReverts() public {
        attest.issue(wallet, policyId, _params());
        vm.prank(makeAddr("relayer"));
        vm.expectRevert(PolicyValidationHook.SenderNotOwner.selector);
        auction.submitBid(1e18, 100, wallet, "");
    }

    function testUngatedAuctionAcceptsAnyBid() public {
        MockAuction open = new MockAuction(IValidationHook(address(0)));
        vm.prank(wallet);
        open.submitBid(1e18, 100, wallet, "");
        assertEq(open.bidCount(), 1);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
forge test --match-path test/Integration.t.sol -vvv
```

Expected: compilation failure — `MockAuction` does not exist.

- [ ] **Step 3: Write `src/mocks/MockAuction.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {IValidationHook} from "../interfaces/IValidationHook.sol";

/**
 * @title  MockAuction
 * @notice Demo/test stand-in for a CCA auction: calls the validation hook with
 *         _submitBid's semantics before accepting a bid
 */
contract MockAuction {
    event BidAccepted(address indexed owner, address indexed sender, uint256 maxPrice, uint128 amount);

    IValidationHook public immutable validationHook;
    uint256 public bidCount;

    constructor(IValidationHook _validationHook) {
        validationHook = _validationHook;
    }

    function submitBid(uint256 maxPrice, uint128 amount, address owner, bytes calldata hookData) external {
        if (address(validationHook) != address(0)) {
            validationHook.validate(maxPrice, amount, owner, msg.sender, hookData);
        }
        bidCount++;
        emit BidAccepted(owner, msg.sender, maxPrice, amount);
    }
}
```

- [ ] **Step 4: Run the full suite**

```bash
forge test -vvv
```

Expected: all tests PASS.

- [ ] **Step 5: Format and commit**

```bash
forge fmt
git add src/mocks/MockAuction.sol test/Integration.t.sol
git commit -m "feat(attest-contracts): Add MockAuction bid simulator with hook integration tests"
```

---

### Task 10: Deploy script and CI

**Files:**
- Create: `script/DeployAttest.s.sol`
- Create: `.github/workflows/attest-contracts.yml`
- Test: `script/test` not needed — the script is exercised by a dry-run.

**Interfaces:**
- Consumes: the finished `ZKPassportAttest`.
- Produces: `DeployAttest.s.sol` reading `ROOT_VERIFIER_ADDRESS`, `ATTEST_DOMAIN`, `ATTEST_ADMIN_ADDRESS`, `ATTEST_GUARDIAN_ADDRESS`, `CREATE2_SALT` env vars; CI job mirroring `registry-contracts.yml`.

- [ ] **Step 1: Write `script/DeployAttest.s.sol`**

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {ZKPassportAttest} from "../src/ZKPassportAttest.sol";
import {IRootVerifier} from "../src/interfaces/IRootVerifier.sol";

contract DeployAttestScript is Script {
    function run() public {
        address rootVerifier = vm.envAddress("ROOT_VERIFIER_ADDRESS");
        require(rootVerifier != address(0), "ROOT_VERIFIER_ADDRESS must be set");
        string memory domain = vm.envOr("ATTEST_DOMAIN", string("zkpassport.id"));
        address adminAddress = vm.envAddress("ATTEST_ADMIN_ADDRESS");
        require(adminAddress != address(0), "ATTEST_ADMIN_ADDRESS must be set");
        address guardianAddress = vm.envOr("ATTEST_GUARDIAN_ADDRESS", address(0));
        bytes32 create2Salt = vm.envOr("CREATE2_SALT", bytes32(0));

        vm.startBroadcast();
        ZKPassportAttest attest = new ZKPassportAttest{salt: create2Salt}(
            IRootVerifier(rootVerifier), domain, adminAddress, guardianAddress
        );
        vm.stopBroadcast();

        console.log("ZKPassportAttest deployed at:", address(attest));

        string memory json = "attest";
        vm.serializeAddress(json, "address", address(attest));
        vm.serializeAddress(json, "root_verifier", rootVerifier);
        json = vm.serializeUint(json, "deployed_at", block.timestamp);
        vm.writeJson(json, string.concat("deployments/", vm.toString(block.chainid), ".json"));
    }
}
```

- [ ] **Step 2: Dry-run the script against a local anvil**

```bash
anvil --port 8545 &
ANVIL_PID=$!
ROOT_VERIFIER_ADDRESS=0x0000000000000000000000000000000000000001 \
ATTEST_ADMIN_ADDRESS=0x0000000000000000000000000000000000000002 \
forge script script/DeployAttest.s.sol --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast
kill $ANVIL_PID
```

Expected: broadcast succeeds, `deployments/31337.json` written with the attest address.

- [ ] **Step 3: Write `.github/workflows/attest-contracts.yml`** (mirror of `registry-contracts.yml`)

```yaml
name: Attest Contracts

on:
  push:
    branches: [main, develop]
  pull_request:
    types: [opened, reopened, ready_for_review, synchronize]

env:
  FOUNDRY_PROFILE: ci

jobs:
  test:
    name: Build & Test
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.4.4

      - name: Show Forge version
        run: forge --version
        working-directory: packages/attest-contracts

      - name: Run checks
        id: check
        run: |
          forge fmt --check
          forge lint src
        working-directory: packages/attest-contracts

      - name: Build contracts
        id: build
        run: forge build --sizes
        working-directory: packages/attest-contracts

      - name: Run tests
        id: test
        run: forge test -vvv
        working-directory: packages/attest-contracts
```

- [ ] **Step 4: Final verification**

```bash
forge fmt --check
forge lint src
forge build --sizes
forge test -vvv
```

Expected: everything green. Fix any fmt/lint findings before committing.

- [ ] **Step 5: Commit**

```bash
rm -f deployments/31337.json
git add script/DeployAttest.s.sol ../../.github/workflows/attest-contracts.yml
git commit -m "feat(attest-contracts): Add deploy script and CI workflow"
```

(`deployments/31337.json` is anvil-local output from the dry run — never committed.)

---

### Task 11: Scope PR to develop (separate, must merge before PR 1 opens)

**Files (on a NEW branch off `origin/develop`, not this worktree's branch):**
- Modify: `.github/workflows/check-pr.yml:27` and `:41`
- Modify: `CLAUDE.md` (commit-scope list)

**Interfaces:**
- Consumes: nothing from Tasks 1–10.
- Produces: `develop`'s PR-title regex accepts `attest-contracts`, unblocking the PR-1 title `feat(attest-contracts): …` (Linear MVE-89). The workflow runs on `pull_request_target`, so this must be merged to `develop` before PR 1 opens.

- [ ] **Step 1: Create the branch in a throwaway worktree**

```bash
git fetch origin develop
git worktree add /tmp/wt-attest-scope -b martin/attest-contracts-scope origin/develop
cd /tmp/wt-attest-scope
```

- [ ] **Step 2: Extend the regex in both steps of `.github/workflows/check-pr.yml`**

Both occurrences of the scopes line become:

```
            (attest-contracts|contracts|registry|explorer|registry-sdk|sdk|ui|utils|workspace)(,(attest-contracts|contracts|registry|explorer|registry-sdk|sdk|ui|utils|workspace))*
```

- [ ] **Step 3: Extend the scope list in `CLAUDE.md`**

In the `<commits_and_prs>` section, the scope line becomes:

```
Scope must match one of: (attest-contracts|contracts|registry|explorer|registry-sdk|sdk|ui|utils|workspace)(,(attest-contracts|contracts|registry|explorer|registry-sdk|sdk|ui|utils|workspace))*
```

- [ ] **Step 4: Commit, push, open the PR**

```bash
git add .github/workflows/check-pr.yml CLAUDE.md
git commit -m "ci: Accept attest-contracts scope in PR title check"
git push -u origin martin/attest-contracts-scope
gh pr create --base develop --title "ci: Accept attest-contracts scope in PR title check" \
  --body "Adds the attest-contracts scope to the PR title check ahead of the attest contracts PR. Runs on pull_request_target, so it must be on develop before that PR opens."
cd - && git worktree remove /tmp/wt-attest-scope
```

Note: `CLAUDE.md` exists on `develop` only once PR #259 merges. If it hasn't merged yet, skip Step 3 (the workflow regex is the enforced part) and apply the CLAUDE.md line in PR #259's branch instead. Mark Linear MVE-89 Done when this PR merges.

---

## Final state

PR 1 (`martin/uniswap-l1` → `develop`) contains: spec + this plan, `packages/attest-contracts` (contracts, tests, mocks, deploy script), the OZ submodule, and the CI workflow. PR title: `feat(attest-contracts): Add ZKPassport attest credential registry and policy hooks`. Blocked on Task 11's PR merging first.
