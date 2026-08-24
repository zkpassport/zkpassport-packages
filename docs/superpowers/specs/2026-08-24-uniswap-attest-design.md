# ZKPassport Attest: L1 credential registry + Uniswap CCA integration

Design for the on-chain half of the ZKPassport x Uniswap integration described in
`spec.md`. Privacy-preserving identity credentials as a soulbound ERC-1155, consumed
by Uniswap's Continuous Clearing Auction (CCA) validation-hook rails — and by any
other contract that can read a token balance. Nothing here is Uniswap-specific
except the per-policy hook contract, which implements Uniswap's published
`IValidationHook` interface.

## Validated external facts

- `Uniswap/continuous-clearing-auction` defines
  `IValidationHook.validate(uint256 maxPrice, uint128 amount, address owner, address sender, bytes hookData)`;
  the auction calls it on every bid and the hook MUST revert to reject.
- Stock periphery hooks: `BaseERC1155ValidationHook` (requires `sender == owner`
  and `balanceOf(owner, tokenId) > 0`, ERC-165 introspection via
  `ValidationHookIntrospection`) and `GatedERC1155ValidationHook` (adds an
  immutable `expirationBlock` after which the gate turns OFF).
- There is no distinct "Uniswap RWA product" with its own gating interface as of
  August 2026; RWA tokens trade on regular pools. The ERC-1155 read is the whole
  contract surface we can rely on, which this design treats as a feature.

## Decisions (settled during brainstorming)

1. **Enforcement: structured predicates.** Policies store typed requirement
   fields on-chain; one shared `issue()` routine enforces them against the
   ZKPassport proof. No per-policy code, no provider indirection, no vendor
   signature.
2. **Hook model: perpetual hook per policy.** `createPolicy` deploys one
   immutable hook per policy (no expiration block). Credential expiry lives in
   `balanceOf` via `heldUntil`, not in the hook.
3. **Scope: PR stack.** This design covers PR 1 (contracts). Later PRs: TS
   bindings, verify-button npm package, popup mint flow (possibly another repo),
   and a kitchen-sink demo dapp.
4. **Demo fidelity: minimal bid simulator.** The kitchen-sink dapp exercises
   the hook through a ~30-line `MockAuction` contract that calls
   `hook.validate()` with `_submitBid`'s exact semantics, rather than vendoring
   Uniswap's CCA contracts.

## Components

New Foundry package: `packages/attest-contracts`, separate from
`registry-contracts` (core protocol) so the attest product has its own audit
scope, deploy cadence, and CI. It consumes the verifier sources via a
remapping to the sibling package (`@registry/=../registry-contracts/src/`) and
reuses its `lib/` (forge-std) rather than adding a second submodule. The `attest-contracts` scope must be added to the PR-title regex in
`.github/workflows/check-pr.yml` (both validation steps) and to the
commit-scope list in `CLAUDE.md`. Because that workflow runs on
`pull_request_target` (base branch's workflow definition), the scope addition
must merge to `develop` before PR 1 opens — as a small `ci:`-typed PR, which
requires no scope.

### ZKPassportAttest (soulbound ERC-1155 credential registry)

One deployment per chain. Extends OZ `ERC1155`; one `tokenId` = one `policyId`.

```solidity
struct Policy {
    address owner;            // policy creator; controls metadata URL only
    uint64 validityPeriod;    // credential lifetime in seconds
    bool unique;              // one person, one credential (nullifier enforced)
    uint8 minAge;             // 0 = no age requirement
    bool sanctionsCheck;      // enforce current sanctions root
    string[] excludedCountries; // ISO alpha-3, empty = none
    string metadataURL;       // off-chain JSON: display name, requirements, verify URL
    address hook;             // the policy's PolicyValidationHook, set at creation
}
```

- `createPolicy(...) returns (uint256 policyId)` — permissionless.
  `policyId = uint256(keccak256(abi.encode(owner, salt)))` with a
  creator-chosen salt (revert if the id exists): ids are namespaced by owner,
  so nobody can front-run an announced id or squat official-looking ones, and
  the same owner + salt yields the same policyId on every chain. Enumeration
  uses `PolicyCreated` events (no counter). Deploys the policy's
  `PolicyValidationHook` in the same transaction (CREATE2 salted by policyId,
  for cross-chain-stable hook addresses where the registry address is itself
  deterministic) and stores its address. Predicates are immutable after creation; only
  `metadataURL` is mutable (by `policy.owner`).
- `issue(address wallet, uint256 policyId, ProofVerificationParams params)` —
  permissionless (anyone can pay gas; the proof pins the recipient):
  1. Verify proof via the existing `ZKPassportRootVerifier`.
  2. Bound-data checks (as in the ignition `ZKPassportProvider` reference):
     `boundData.senderAddress == wallet`, `boundData.chainId == block.chainid`,
     no extra custom data; `domain` pinned to the ZKPassport origin constant;
     `scope` must equal `"attest:<policyId>"` so a proof cannot be replayed
     against a different policy.
  3. Enforce predicates via `ZKPassportHelper`: `isAgeAboveOrEqual(minAge)`,
     `isNationalityOut(excludedCountries)`, `enforceSanctionsRoot` when
     `sanctionsCheck`.
  4. If `unique`: record the nullifier in
     `mapping(uint256 policyId => mapping(bytes32 nullifier => address wallet))`
     — scoped per policy so credentials across policies stay unlinkable. First
     use binds the nullifier to the recipient wallet; re-use is valid only for
     that same wallet (enables renewal), otherwise revert `SybilDetected`.
  5. `heldUntil[wallet][policyId] = block.timestamp + policy.validityPeriod`;
     `_mint(wallet, policyId, 1, "")` only when the internal 1155 balance is 0
     (renewals just extend `heldUntil`).
- `balanceOf(address a, uint256 id)` override:
  `heldUntil[a][id] >= block.timestamp ? 1 : 0`. Expiry is implicit; no
  keeper, no revocation transaction needed for lapse.
- `renew` — same path as `issue` (fresh proof, extends `heldUntil`).
  `validityPeriod` is read from the policy at issue time; policy predicates are
  immutable so there is no retro-extension hazard.
- `revoke(address wallet, uint256 policyId)` — callable by the holder
  (`wallet == msg.sender`) or by a ZKPassport guardian role (sanctions
  updates). Never by the policy owner. Zeroes `heldUntil`; burns if internal
  balance is 1.
- Soulbound: `_update` reverts on any transfer (`from != 0` and `to != 0`);
  burns allowed only via `revoke`. `setApprovalForAll` reverts.
- `uri(uint256 policyId)` returns `policy.metadataURL`.
- Guardian: single role held by ZKPassport ops (same pattern as
  `ProtocolController` admin/guardian in this package); can revoke credentials
  and pause `issue` (not `balanceOf`).

### PolicyValidationHook

Tiny immutable contract deployed by `createPolicy` (plain `new`; no factory or
clones — the bytecode is small and creation is one-time per policy).

- `immutable attest` (IERC1155), `immutable policyId`.
- `validate(uint256, uint128, address owner, address sender, bytes calldata)`:
  revert unless `sender == owner` and `attest.balanceOf(owner, policyId) > 0`.
  Reverts use the stock Uniswap error names (`NotOwnerOfERC1155Token`) for
  backend compatibility.
- ERC-165: advertises `IValidationHook`, the stock
  `IBaseERC1155ValidationHook` id (so Uniswap's generic introspection resolves
  `erc1155()` and `tokenId()` getters), and a `IZKPassportPolicyHook` id
  exposing `(attest, policyId)`.

### What Uniswap reads (no vendor code)

1. Launcher dropdown: enumerate `PolicyCreated` events filtered by trusted
   `owner` (indexed): ZKPassport's published ops address for ready policies,
   plus the connected launcher's own address for custom ones. The registry
   itself stays permissionless; curation is a per-consumer display choice, and
   `uri()` metadata is only fetched for trusted owners.
2. Auction deploy: chosen policy's `hook` address into the existing
   `validationHook` parameter.
3. Auction page: ERC-165 introspection on the hook → `(erc1155, tokenId)` →
   `balanceOf(wallet, tokenId)`; verify link from `uri()` metadata.
4. After popup mint: refetch flips eligibility.

### Kitchen-sink demo dapp (later PR in the stack)

New workspace package (Next.js 14 + React 18 + viem, mirroring
`registry-explorer` conventions) that exercises every flow per persona, so we
can demo and test end-to-end without involving the Uniswap team:

- **Policy creator**: `createPolicy` form with all predicates, policy list,
  metadata URL editor — the same reads Uniswap's launcher dropdown would do.
- **Launcher**: deploy a `MockAuction` wired to a chosen policy's hook;
  introspection panel showing exactly what Uniswap's backend reads via ERC-165
  (`erc1155()`, `tokenId()`, then `balanceOf`).
- **Bidder**: eligibility check → verify → credential mint → bid; shows the
  exact `NotOwnerOfERC1155Token` revert when ungated and the pass when gated.
- **Holder**: credential dashboard (`heldUntil`, countdown), renew, self-revoke.
- **Guardian**: revoke any credential, pause/unpause `issue`.

`MockAuction` lives in `packages/attest-contracts/src/mocks/` and is reused
by the Foundry hook-integration tests — it calls `validate(maxPrice, amount,
owner, sender, hookData)` before accepting a bid, exactly as `_submitBid` does.

Chain modes: anvil with `MockHonkVerifier` (one-click dev-mode "passport") as
the default dev loop; testnet mode against real deployments and the real popup
once the popup PR lands.

Note: the demo package will need its scope added to the PR-title regex in
`.github/workflows/check-pr.yml` and to `CLAUDE.md`, on `develop` before its
PR opens (same `pull_request_target` constraint as above).

## Errors and events

Custom errors in the repo's `Contract__Error` style: `Attest__PolicyNotFound`,
`Attest__InvalidProof`, `Attest__ProofNotBoundToWallet`, `Attest__WrongScope`,
`Attest__WrongDomain`, `Attest__AgeBelowMinimum`, `Attest__ExcludedJurisdiction`,
`Attest__SanctionsCheckFailed`, `Attest__SybilDetected(bytes32 nullifier)`,
`Attest__TokenIsSoulbound`, `Attest__NotRevocable`, `Attest__Paused`.

Events: `PolicyCreated(uint256 indexed policyId, address indexed owner, address hook)`,
`CredentialIssued(address indexed wallet, uint256 indexed policyId, uint64 heldUntil)`,
`CredentialRenewed(...)`, `CredentialRevoked(address indexed wallet, uint256 indexed policyId, address by)`,
`PolicyMetadataURLUpdated(uint256 indexed policyId, string url)`, plus standard
ERC-1155 `TransferSingle` on mint/burn for indexers.

## Testing

Foundry, mirroring the existing `test/*.t.sol` layout, using the
`MockHonkVerifier` pattern for proof verification:

- Predicate units: each of age / country exclusion / sanctions / uniqueness
  accepting and rejecting.
- Bound-data: wrong wallet, wrong chain id, wrong scope (cross-policy replay),
  wrong domain, dev mode.
- Soulbound invariants: transfer, batch transfer, approval all revert; revoke
  burn path works.
- Expiry boundary: `heldUntil == block.timestamp` is valid, `+1s` later is not;
  renewal extends; re-issue after lapse does not double-mint.
- Nullifier: same passport + same wallet renews; same passport + new wallet
  reverts `SybilDetected`; different policies do not collide.
- Hook integration: drive `validate()` as `_submitBid` would — passes with
  credential, reverts without, reverts on `sender != owner`; ERC-165 ids
  answer correctly.
- Guardian: revoke, pause blocks `issue` but not `balanceOf`/`validate`.
- Fuzz: validity periods, policy ids, timestamps.

## Deployment

Forge script in `packages/attest-contracts/script/` following
`registry-contracts`' deploy-script conventions: deploys `ZKPassportAttest` wired to the already
deployed `ZKPassportRootVerifier` for the target chain; guardian set to the
ZKPassport ops address. Policies are created later, permissionlessly, per
integration.

## Out of scope for PR 1

TS bindings (PR 2), verify-button npm package (PR 3), popup mint flow (PR 4 or
separate repo), kitchen-sink demo dapp (PR 5 — though its `MockAuction`
contract ships in PR 1 for the hook-integration tests), post-auction v4 pool
hooks, fee sponsorship tooling.
