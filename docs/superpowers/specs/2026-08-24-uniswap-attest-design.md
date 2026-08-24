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
   bindings, verify-button npm package, popup mint flow (possibly another repo).

## Components

New directory: `packages/registry-contracts/src/attest/`.

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

- `createPolicy(...) returns (uint256 policyId)` — permissionless. Sequential
  ids. Deploys the policy's `PolicyValidationHook` in the same transaction and
  stores its address. Predicates are immutable after creation; only
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

1. Launcher dropdown: enumerate `PolicyCreated` events / `policyCount`, render
   `uri(policyId)` metadata.
2. Auction deploy: chosen policy's `hook` address into the existing
   `validationHook` parameter.
3. Auction page: ERC-165 introspection on the hook → `(erc1155, tokenId)` →
   `balanceOf(wallet, tokenId)`; verify link from `uri()` metadata.
4. After popup mint: refetch flips eligibility.

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

Forge script in `packages/registry-contracts/script/` following the existing
deploy-script conventions: deploys `ZKPassportAttest` wired to the already
deployed `ZKPassportRootVerifier` for the target chain; guardian set to the
ZKPassport ops address. Policies are created later, permissionlessly, per
integration.

## Out of scope for PR 1

TS bindings (PR 2), verify-button npm package (PR 3), popup mint flow (PR 4 or
separate repo), post-auction v4 pool hooks, fee sponsorship tooling.
