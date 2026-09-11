import type { Chain, PublicClient, WalletClient } from "viem"
import { createPublicClient, encodeAbiParameters, getAbiItem, http, keccak256 } from "viem"
import { getChainFromId } from "@zkpassport/utils"
import type { FacematchMode, NullifierType, ProofResult } from "@zkpassport/utils"
import { getAttestRegistry } from "./deployments"
import { SolidityVerifier } from "../solidity-verifier"
import { ZKPassportCredentialsAbi } from "../assets/abi/zkpassport-credentials"
import { PolicyEvaluatorV1Abi } from "../assets/abi/policy-evaluator-v1"

/** Structural slice of viem's PublicClient. */
export type AttestReadClient = Pick<PublicClient, "readContract" | "getLogs" | "getBlockNumber">

export type AttestPolicy = {
  /**
   * Address that created the policy, and consequently has some special admin rights over it.
   */
  owner: `0x${string}`
  /**
   * Time in seconds from the moment credentials for this policy are issued until they automatically
   * expire. After expiration, credentials can be renewed by calling `issue` with a fresh proof.
   */
  credentialDuration: bigint
  /** When true, the policy owner may issue credentials directly via ownerIssue(), without a proof. */
  ownerIssuable: boolean
  /**
   * When true, the policy owner may ban a wallet via ban(), which also removes any standing
   * credential and blocks issuance and renewal until the owner unbans it. Holders may always
   * renounce their own credential.
   */
  ownerBannable: boolean
  /** When true, the policy owner may replace the policy's requirements via setRequirements(). */
  ownerEditable: boolean
  /**
   * Address of the contract that defines and decodes the policy's requirements schema, and that
   * determines whether a proof satisfies the requirements.
   */
  evaluator: `0x${string}`
  /**
   * Requirements bytes. Interpretation of these bytes is owned by the policy's evaluator.
   */
  requirements: `0x${string}`
  /**
   * URL of the display metadata for the policy's token, returned as-is by the contract's
   * ERC-1155 `uri(policyId)`. Updatable by the policy owner at any time.
   */
  metadataURL: string
  /**
   * Timestamp that tracks whether the policy has been retired by its owner, and when.
   */
  retiredAt: bigint
}

/**
 * Policy requirements.
 */
export type AttestPolicyRequirements = {
  /**
   * Any `uniqueIdentifierType` value other than `NONE` requires the proof to carry exactly that
   * nullifier type — mock types included; the contract does no dev-mode folding.
   */
  uniqueIdentifierType: NullifierType
  /**
   * `enforceUniqueness` limits issuance to one credential per document.
   */
  enforceUniqueness: boolean
  /**
   * `minAge` defines an inclusive bound, so setting it to 0 means effectively no age check.
   */
  minAge: number
  /**
   * Sanctions non-membership check the proof must carry. Undefined when the policy does not
   * require one. In "normal" mode a match requires name + date of birth or document number +
   * nationality; "strict" additionally matches on name alone, which is harder to evade but
   * has a higher false-positive rate.
   */
  sanctionsMode?: "normal" | "strict"
  /**
   * FaceMatch check (ID photo vs. live selfie) the proof must carry; undefined when the policy
   * does not require one. "strict" runs an extensive liveness check, "regular" a basic, faster
   * one. Salted-nullifier policies require "strict", as the app salts nullifiers through a
   * strict FaceMatch attestation.
   */
  facematchMode?: FacematchMode
  /**
   * Nationalities accepted by this policy. Must be ISO 3166-1 alpha-3, sorted ascending; an empty
   * list disables that check.
   */
  includedNationalities: readonly string[]
  /**
   * Nationalities rejected by this policy. Must be ISO 3166-1 alpha-3, sorted ascending; an empty
   * list disables that check.
   */
  excludedNationalities: readonly string[]
}

const SANCTIONS_MODES: Record<number, "normal" | "strict" | undefined> = {
  0: undefined,
  1: "normal",
  2: "strict",
}

const FACEMATCH_MODES: Record<number, FacematchMode | undefined> = {
  0: undefined,
  1: "regular",
  2: "strict",
}

const SANCTIONS_MODE_VALUES: Record<"normal" | "strict", number> = { normal: 1, strict: 2 }

const FACEMATCH_MODE_VALUES: Record<FacematchMode, number> = { regular: 1, strict: 2 }

// The tuple layout createPolicy()'s and setRequirements()'s requirement bytes must carry for a
// schema-1 evaluator, taken from the evaluator's own decodeRequirements so the encoding can
// never drift from the contract.
const REQUIREMENTS_ABI = getAbiItem({
  abi: PolicyEvaluatorV1Abi,
  name: "decodeRequirements",
}).outputs

/**
 * Encode policy requirements per PolicyEvaluatorV1's schema-1 layout, the inverse of
 * `AttestClient.getRequirements`. The encoder only shapes the bytes; validity (country-list
 * format and ordering, salted-nullifier facematch, uniqueness needing a nullifier type) is
 * enforced on-chain by the evaluator when the bytes reach createPolicy() or setRequirements().
 */
export function encodeAttestPolicyRequirements(
  requirements: AttestPolicyRequirements,
): `0x${string}` {
  const value = {
    uniqueIdentifierType: requirements.uniqueIdentifierType,
    enforceUniqueness: requirements.enforceUniqueness,
    minAge: requirements.minAge,
    sanctionsMode:
      requirements.sanctionsMode === undefined
        ? 0
        : SANCTIONS_MODE_VALUES[requirements.sanctionsMode],
    faceMatchMode:
      requirements.facematchMode === undefined
        ? 0
        : FACEMATCH_MODE_VALUES[requirements.facematchMode],
    includedNationalities: requirements.includedNationalities,
    excludedNationalities: requirements.excludedNationalities,
  }
  return encodeAbiParameters(REQUIREMENTS_ABI, [value] as never)
}

/**
 * The policy id createPolicy() will assign for a creator and salt:
 * `keccak256(abi.encode(creator, salt))`. Lets a caller know the id before the transaction
 * lands (or after, without parsing logs).
 */
export function computePolicyId(creator: `0x${string}`, salt: `0x${string}`): bigint {
  return BigInt(
    keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [creator, salt])),
  )
}

export type AttestPolicySummary = {
  policyId: bigint
  owner: `0x${string}`
}

const POLICY_CREATED_EVENT = getAbiItem({ abi: ZKPassportCredentialsAbi, name: "PolicyCreated" })

// The tuple layout issue()'s proofData bytes must carry for a schema-1 evaluator, taken from
// the evaluator's own decodeProofData so the encoding can never drift from the contract.
const PROOF_DATA_ABI = getAbiItem({ abi: PolicyEvaluatorV1Abi, name: "decodeProofData" }).outputs

/**
 * Typed bindings for the ZKPassportCredentials credential registry.
 */
export class AttestClient {
  private readonly client: AttestReadClient
  public readonly address: `0x${string}`
  private readonly deployBlock?: bigint

  constructor(options: { client: AttestReadClient; address: `0x${string}`; deployBlock?: bigint }) {
    this.client = options.client
    this.address = options.address
    this.deployBlock = options.deployBlock
  }

  private read(functionName: string, args: readonly unknown[]) {
    return this.client.readContract({
      address: this.address,
      abi: ZKPassportCredentialsAbi,
      functionName,
      args,
    } as never)
  }

  async getPolicy(policyId: bigint): Promise<AttestPolicy> {
    return (await this.read("getPolicy", [policyId])) as AttestPolicy
  }

  /**
   * Decode a policy's requirements through its own evaluator, so the request a client builds is
   * derived from exactly what issue() will enforce.
   */
  async getRequirements(policy: AttestPolicy): Promise<AttestPolicyRequirements> {
    const evaluatorRead = (functionName: string, args: readonly unknown[]) =>
      this.client.readContract({
        address: policy.evaluator,
        abi: PolicyEvaluatorV1Abi,
        functionName,
        args,
      } as never)

    const schemaVersion = (await evaluatorRead("schemaVersion", [])) as bigint
    if (schemaVersion !== 1n) {
      throw new Error(
        `Unsupported policy evaluator schema ${schemaVersion} at ${policy.evaluator}; this SDK decodes schema 1.`,
      )
    }

    const decoded = (await evaluatorRead("decodeRequirements", [policy.requirements])) as Omit<
      AttestPolicyRequirements,
      "uniqueIdentifierType" | "sanctionsMode" | "facematchMode"
    > & { uniqueIdentifierType: number; sanctionsMode: number; faceMatchMode: number }

    return {
      uniqueIdentifierType: decoded.uniqueIdentifierType as NullifierType,
      enforceUniqueness: decoded.enforceUniqueness,
      minAge: decoded.minAge,
      sanctionsMode: SANCTIONS_MODES[decoded.sanctionsMode],
      facematchMode: FACEMATCH_MODES[decoded.faceMatchMode],
      includedNationalities: decoded.includedNationalities,
      excludedNationalities: decoded.excludedNationalities,
    }
  }

  async uri(policyId: bigint): Promise<string> {
    return (await this.read("uri", [policyId])) as string
  }

  /**
   * 1 while the wallet holds an unexpired credential, else 0. Expiry is time-based: the balance
   * drops to 0 the moment `heldUntil` passes, with no burn and no `Transfer` event. Do not index
   * balances from events.
   */
  async balanceOf(wallet: `0x${string}`, policyId: bigint): Promise<bigint> {
    return (await this.read("balanceOf", [wallet, policyId])) as bigint
  }

  /**
   * True while the wallet holds an unexpired credential for the policy.
   */
  async hasCredential(wallet: `0x${string}`, policyId: bigint): Promise<boolean> {
    return (await this.balanceOf(wallet, policyId)) > 0n
  }

  /**
   * Unix timestamp (seconds, as bigint) the credential is valid until; 0 means never issued,
   * renounced, or removed by a ban.
   */
  async heldUntil(wallet: `0x${string}`, policyId: bigint): Promise<bigint> {
    return (await this.read("heldUntil", [wallet, policyId])) as bigint
  }

  /**
   * True while the wallet is banned from the policy by its owner; issue() and ownerIssue()
   * revert for banned wallets until the owner unbans.
   */
  async banned(wallet: `0x${string}`, policyId: bigint): Promise<boolean> {
    return (await this.read("banned", [wallet, policyId])) as boolean
  }

  /**
   * The proof scope for a policy.
   */
  async policyScope(policyId: bigint): Promise<string> {
    return (await this.read("policyScope", [policyId])) as string
  }

  /**
   * The registry's domain, which issue() verifies proofs against.
   */
  async domain(): Promise<string> {
    return (await this.read("domain", [])) as string
  }

  /**
   * Enumerate policies from `PolicyCreated` logs. Policy ids are `keccak256(creator, salt)`,
   * so the registry has no on-chain list; logs are the only on-chain enumeration. Apps that
   * need frequent or large listings should index `PolicyCreated` themselves instead.
   *
   * The scan starts at `fromBlock`, or the client's `deployBlock` when omitted; constructing
   * the client without either is an error. It ends at `toBlock`, or the current block.
   */
  async listPolicies(
    filter: {
      owner?: `0x${string}`
      fromBlock?: bigint
      toBlock?: bigint
      blockRange?: bigint
    } = {},
  ): Promise<AttestPolicySummary[]> {
    const fromBlock = filter.fromBlock ?? this.deployBlock
    if (fromBlock === undefined) {
      throw new Error(
        "listPolicies needs a starting block: pass fromBlock, or construct AttestClient with the registry's deployBlock.",
      )
    }

    const blockRange = filter.blockRange ?? 10_000n
    if (blockRange < 1n) throw new Error("blockRange must be at least 1")

    const toBlock = filter.toBlock ?? (await this.client.getBlockNumber())
    const summaries: AttestPolicySummary[] = []

    for (let start = fromBlock; start <= toBlock; start += blockRange) {
      const end = start + blockRange - 1n < toBlock ? start + blockRange - 1n : toBlock
      const logs = await this.client.getLogs({
        address: this.address,
        event: POLICY_CREATED_EVENT,
        args: filter.owner !== undefined ? { owner: filter.owner } : undefined,
        fromBlock: start,
        toBlock: end,
      } as never)

      for (const log of logs as unknown as { args: AttestPolicySummary }[]) {
        summaries.push({ policyId: log.args.policyId, owner: log.args.owner })
      }
    }

    return summaries
  }

  /**
   * Call details for ZKPassportCredentials.issue(policyId, proofData).
   *
   * Issuance is permissionless: any sender may submit, and the credential lands on the wallet the
   * proof is bound to. Renewal is achieved through the same call: issuing again extends
   * `heldUntil`.
   *
   * On-chain preconditions the transaction must satisfy or `issue()` reverts:
   * - The proof must be bound to the recipient wallet and to the chain the registry lives on
   *   (request the proof with those bindings).
   * - The proof's bound `customData` must be empty.
   * - `devMode` is accepted; mock-document proofs (dev mode) verify only against testnet
   *   registries, which contain the mock certificates. On mainnet deployments they fail the
   *   certificate root check.
   * - The proof must be at most 1 day old at inclusion time.
   * - The recipient wallet must not be banned. A ban blocks issuance until the policy owner
   *   unbans. Only relevant for `ownerBannable` policies.
   * - The policy must exist, not be retired, and the registry not paused.
   */
  getIssueDetails(): {
    address: `0x${string}`
    functionName: "issue"
    abi: typeof ZKPassportCredentialsAbi
  } {
    return { address: this.address, functionName: "issue", abi: ZKPassportCredentialsAbi }
  }

  /**
   * Build the `proofData` argument for `issue()` from an SDK proof: the proof verification
   * params encoded per PolicyEvaluatorV1's schema-1 layout. Policies pinned to another
   * evaluator schema need that schema's encoding instead; `getRequirements` rejects such
   * policies before a proof request is ever built.
   *
   * Pass the scope obtained from `policyScope(policyId)`. A manually built string risks not
   * matching what the contract expects to verify.
   */
  static getIssueProofData(options: {
    proof: ProofResult
    domain: string
    scope: string
    validityPeriodInSeconds?: number
    devMode?: boolean
  }): `0x${string}` {
    const params = SolidityVerifier.getParameters({
      proof: options.proof,
      domain: options.domain,
      scope: options.scope,
      validityPeriodInSeconds: options.validityPeriodInSeconds,
      devMode: options.devMode ?? false,
    })
    return encodeAbiParameters(PROOF_DATA_ABI, [params] as never)
  }

  /**
   * Assemble the ready-to-send issue() call for a policy from a verified
   * proof: this client's registry details plus the proof data encoded via
   * getIssueProofData.
   */
  buildIssueCall(options: {
    policyId: bigint
    proof: ProofResult
    domain: string
    scope: string
    validityPeriodInSeconds?: number
    devMode?: boolean
  }): AttestIssueCall {
    const proofData = AttestClient.getIssueProofData({
      proof: options.proof,
      domain: options.domain,
      scope: options.scope,
      validityPeriodInSeconds: options.validityPeriodInSeconds,
      devMode: options.devMode,
    })
    const details = this.getIssueDetails()
    return {
      address: details.address,
      functionName: details.functionName,
      abi: details.abi,
      args: [options.policyId, proofData] as const,
    }
  }

  private call<F extends string, A>(functionName: F, args: A): AttestCall<F, A> {
    return { address: this.address, functionName, abi: ZKPassportCredentialsAbi, args }
  }

  /**
   * Assemble the createPolicy() call. The sender becomes the policy owner; the policy id is
   * `keccak256(creator, salt)` (predictable via `computePolicyId`), so a creator reusing a salt
   * reverts. Requirements are encoded per the current evaluator's schema and validated on-chain
   * at creation. The three owner-privilege flags default to false and are immutable afterwards.
   */
  buildCreatePolicyCall(options: {
    /** Creator-scoped namespace for the policy id. */
    salt: `0x${string}`
    requirements: AttestPolicyRequirements
    /** Seconds a credential stays valid after each issuance or renewal; must be non-zero. */
    credentialDuration: bigint
    /** Display metadata for the policy's token, served by uri(policyId). */
    metadataURL: string
    /** Allow proofless issuance via ownerIssue(). */
    ownerIssuable?: boolean
    /** Allow the owner to ban wallets (removing any standing credential) via ban(). */
    ownerBannable?: boolean
    /** Allow the owner to replace requirements via setRequirements(). */
    ownerEditable?: boolean
  }): AttestCall<
    "createPolicy",
    readonly [`0x${string}`, `0x${string}`, bigint, string, boolean, boolean, boolean]
  > {
    return this.call("createPolicy", [
      options.salt,
      encodeAttestPolicyRequirements(options.requirements),
      options.credentialDuration,
      options.metadataURL,
      options.ownerIssuable ?? false,
      options.ownerBannable ?? false,
      options.ownerEditable ?? false,
    ] as const)
  }

  /**
   * Assemble the setRequirements() call, replacing a policy's requirements for all future
   * issuance and renewals. Owner-only, and only for `ownerEditable` policies; the new bytes are
   * validated on-chain by the policy's pinned evaluator, and the transaction emits
   * PolicyRequirementsChanged. Already-issued credentials are untouched until they expire or
   * renew.
   */
  buildSetRequirementsCall(
    policyId: bigint,
    requirements: AttestPolicyRequirements,
  ): AttestCall<"setRequirements", readonly [bigint, `0x${string}`]> {
    return this.call("setRequirements", [
      policyId,
      encodeAttestPolicyRequirements(requirements),
    ] as const)
  }

  /** Assemble the setMetadataURL() call, updating a policy's display metadata URL. Owner-only. */
  buildSetMetadataURLCall(
    policyId: bigint,
    url: string,
  ): AttestCall<"setMetadataURL", readonly [bigint, string]> {
    return this.call("setMetadataURL", [policyId, url] as const)
  }

  /**
   * Assemble the retire() call, permanently stopping new issuance and renewals for a policy.
   * Owner-only and one-way; existing credentials stay valid until they expire.
   */
  buildRetireCall(policyId: bigint): AttestCall<"retire", readonly [bigint]> {
    return this.call("retire", [policyId] as const)
  }

  /**
   * Assemble the ownerIssue() call, issuing (or extending) a credential without a proof.
   * Owner-only, and only for `ownerIssuable` policies; reverts for banned wallets and retired
   * policies. Owner issuance never touches nullifier bindings, so on `enforceUniqueness`
   * policies it bypasses one-per-document sybil protection.
   */
  buildOwnerIssueCall(
    wallet: `0x${string}`,
    policyId: bigint,
  ): AttestCall<"ownerIssue", readonly [`0x${string}`, bigint]> {
    return this.call("ownerIssue", [wallet, policyId] as const)
  }

  /**
   * Assemble the renounce() call, giving up the sender's own credential for a policy.
   * Renouncing never bans: the holder may re-prove and re-issue at will. The nullifier stays
   * bound to the wallet, so the document can only ever re-credential the same wallet for
   * this policy.
   */
  buildRenounceCall(policyId: bigint): AttestCall<"renounce", readonly [bigint]> {
    return this.call("renounce", [policyId] as const)
  }

  /**
   * Assemble the ban() call, banning a wallet from a policy effective immediately: any
   * standing credential is removed in the same transaction, and issuance and renewal stay
   * blocked until unban(). Owner-only, and only for `ownerBannable` policies.
   */
  buildBanCall(
    wallet: `0x${string}`,
    policyId: bigint,
  ): AttestCall<"ban", readonly [`0x${string}`, bigint]> {
    return this.call("ban", [wallet, policyId] as const)
  }

  /**
   * Assemble the unban() call, lifting a ban placed on a wallet. Owner-only.
   */
  buildUnbanCall(
    wallet: `0x${string}`,
    policyId: bigint,
  ): AttestCall<"unban", readonly [`0x${string}`, bigint]> {
    return this.call("unban", [wallet, policyId] as const)
  }
}

/**
 * Ready-to-send ZKPassportCredentials call assembled by an AttestClient. `address` is the
 * registry address; the fields keep viem's naming so the object spreads straight into
 * writeContract/simulateContract, or submits through `submitAttestCall`.
 */
export type AttestCall<F extends string = string, A = readonly unknown[]> = {
  address: `0x${string}`
  functionName: F
  abi: typeof ZKPassportCredentialsAbi
  args: A
}

/**
 * Ready-to-send ZKPassportCredentials.issue() call. `address` is the registry
 * address; the field keeps viem's naming so the object spreads straight into
 * writeContract/simulateContract.
 */
export type AttestIssueCall = {
  address: `0x${string}`
  functionName: "issue"
  abi: typeof ZKPassportCredentialsAbi
  /** policyId plus the proof data pre-encoded per the policy's evaluator schema. */
  args: readonly [bigint, `0x${string}`]
}

export type AttestContext = {
  chain: Chain
  publicClient: PublicClient
  attest: AttestClient
}

/**
 * Read context for the canonical registry on a chain: a public client on the
 * chain's default RPC plus an AttestClient bound to the registry. The registry
 * is derived from the viem chain's id, so chains without a recorded
 * deployment are rejected here.
 */
export function createAttestContext(chain: Chain): AttestContext {
  const publicClient = createPublicClient({ chain, transport: http() })
  const attest = new AttestClient({
    client: publicClient,
    address: getAttestRegistry(getChainFromId(chain.id)),
  })
  return { chain, publicClient, attest }
}

type SubmittableCall = {
  address: `0x${string}`
  functionName: string
  abi: readonly unknown[]
  args: readonly unknown[]
}

async function submitCall(
  ctx: AttestContext,
  call: SubmittableCall,
  wallet: { client: WalletClient; account: `0x${string}` },
  onSubmitted: ((hash: `0x${string}`) => void) | undefined,
  revertMessage: (hash: `0x${string}`) => string,
): Promise<`0x${string}`> {
  const hash = await wallet.client.writeContract({
    address: call.address,
    abi: call.abi as never,
    functionName: call.functionName,
    args: call.args as never,
    account: wallet.account,
    chain: ctx.chain,
  })
  onSubmitted?.(hash)
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status === "reverted") {
    throw new Error(revertMessage(hash))
  }
  return hash
}

/**
 * Submit ZKPassportCredentials.issue() and wait for inclusion. Any sender
 * works — the credential lands on the wallet the proof is bound to — so a
 * relayer or sponsored-gas flow replaces this function and nothing upstream
 * changes. The wallet client must already be on the context's chain.
 */
export async function submitIssueCall(
  ctx: AttestContext,
  call: {
    address: `0x${string}`
    functionName: "issue"
    abi: readonly unknown[]
    args: readonly [bigint, `0x${string}`]
  },
  wallet: { client: WalletClient; account: `0x${string}` },
  onSubmitted?: (hash: `0x${string}`) => void,
): Promise<`0x${string}`> {
  return submitCall(
    ctx,
    call,
    wallet,
    onSubmitted,
    (hash) => `Credential mint reverted (tx ${hash}).`,
  )
}

/**
 * Submit an AttestClient-assembled registry call and wait for inclusion. Unlike issue(), the
 * owner operations are permissioned: the wallet must be the policy's owner (or, for
 * renounce(), the holder giving up their own credential) or the transaction reverts. The
 * wallet client must already be on
 * the context's chain.
 */
export async function submitAttestCall(
  ctx: AttestContext,
  call: AttestCall<string, readonly unknown[]>,
  wallet: { client: WalletClient; account: `0x${string}` },
  onSubmitted?: (hash: `0x${string}`) => void,
): Promise<`0x${string}`> {
  return submitCall(
    ctx,
    call,
    wallet,
    onSubmitted,
    (hash) => `${call.functionName} transaction reverted (tx ${hash}).`,
  )
}
