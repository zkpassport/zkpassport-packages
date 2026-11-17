import type { AbiEvent, Chain, PublicClient, WalletClient } from "viem"
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  encodeAbiParameters,
  getAbiItem,
  http,
  keccak256,
} from "viem"
import { getChainFromId } from "@zkpassport/utils"
import type { FacematchMode, NullifierType } from "@zkpassport/utils"
import { getCredentialsAddress, getCredentialsDeployBlock } from "./deployments"
import { ZKPassportCredentialsAbi } from "./abi/zkpassport-credentials"
import { PolicyEvaluatorV1Abi } from "./abi/policy-evaluator-v1"
import { PolicyEvaluatorV2Abi } from "./abi/policy-evaluator-v2"

/** Structural slice of viem's PublicClient. */
export type CredentialsReadClient = Pick<
  PublicClient,
  "readContract" | "getLogs" | "getBlockNumber"
>

export type CredentialPolicy = {
  /**
   * Address that created the policy, and consequently has some special admin rights over it.
   */
  owner: `0x${string}`
  /**
   * Time in seconds from the moment credentials for this policy are issued until they automatically
   * expire. After expiration, credentials can be renewed by calling `issue` with a fresh proof.
   */
  credentialDuration: bigint
  /**
   * When true, the policy issues at most one credential per document: each issuance consumes the
   * proof's nullifier, which must then be of the evaluator's `uniqueIdentifierType`. Immutable
   * after creation.
   */
  enforceUniqueness: boolean
  /**
   * When true, the policy owner and its issuers may issue credentials directly via ownerIssue()
   * and ownerIssueBatch(), without a proof.
   */
  ownerIssuable: boolean
  /**
   * When true, the policy owner and its issuers may ban wallets via ban() and banBatch(), which
   * also remove any standing credential and block issuance and renewal until unbanned. Holders
   * may always renounce their own credential.
   */
  ownerBannable: boolean
  /**
   * When true, the policy owner may replace the policy's requirements, evaluator and credential
   * duration via setRequirements(), migrateEvaluator() and setCredentialDuration().
   */
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
export type CredentialPolicyRequirements = {
  /**
   * Minimum age the proof must commit to. The on-chain check is an exact match, not a lower
   * bound: a policy requiring 18 rejects a proof generated for 21. Request the proof with this
   * exact value. 0 disables the check.
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
   * one. Uniqueness policies on a salted evaluator require "strict", as the app salts nullifiers
   * through a strict FaceMatch attestation.
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
  /**
   * The verification methods the policy accepts: exact schemes such as 201 and/or whole tiers, an
   * entry below 100 (1 = every issuer-signed scheme, 2 = every device-attested camera read).
   * `[1, 201]` accepts tier 1 and Android camera reads. Empty or undefined means tier 1 only.
   */
  allowedVerificationMethods?: readonly number[]
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

// The tuple layout for createPolicy()'s and setRequirements()'s requirement bytes.
const REQUIREMENTS_ABI = getAbiItem({
  abi: PolicyEvaluatorV2Abi,
  name: "decodeRequirements",
}).outputs

/**
 * Encode policy requirements.
 */
export function encodeCredentialPolicyRequirements(
  requirements: CredentialPolicyRequirements,
): `0x${string}` {
  const value = {
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
    allowedVerificationMethods: (requirements.allowedVerificationMethods ?? []).map((x) =>
      BigInt(x),
    ),
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

export type CredentialPolicySummary = {
  policyId: bigint
  owner: `0x${string}`
}

export type BannedWallet = {
  wallet: `0x${string}`
  /** The block the ban in force landed in. */
  bannedAtBlock: bigint
}

const POLICY_CREATED_EVENT = getAbiItem({ abi: ZKPassportCredentialsAbi, name: "PolicyCreated" })
const ISSUER_ADDED_EVENT = getAbiItem({ abi: ZKPassportCredentialsAbi, name: "IssuerAdded" })
const ISSUER_REMOVED_EVENT = getAbiItem({ abi: ZKPassportCredentialsAbi, name: "IssuerRemoved" })
const WALLET_BANNED_EVENT = getAbiItem({ abi: ZKPassportCredentialsAbi, name: "WalletBanned" })
const WALLET_UNBANNED_EVENT = getAbiItem({ abi: ZKPassportCredentialsAbi, name: "WalletUnbanned" })

/** The blocks a log scan covers, and the most blocks one getLogs call may span. */
type LogScanRange = {
  fromBlock?: bigint
  toBlock?: bigint
  blockRange?: bigint
}

type OrderedLog = {
  blockNumber: bigint
  logIndex: number
}

type IssuerLog = OrderedLog & {
  args: { policyId: bigint; issuer: `0x${string}` }
}

type BanLog = OrderedLog & {
  args: { policyId: bigint; wallet: `0x${string}` }
}

// The tuple layout issue()'s proofData bytes.
const PROOF_DATA_ABI = getAbiItem({ abi: PolicyEvaluatorV2Abi, name: "decodeProofData" }).outputs

/**
 * The verified proof as PolicyEvaluatorV2's `ProofVerificationParams` struct, which is what
 * `issue()` decodes out of its `proofData` argument. `ZKPassport.getSolidityVerifierParameters()`
 * returns this shape; deriving the params is the SDK's job, encoding them is this package's.
 */
export type IssueProofVerificationParams = {
  version: string
  proofVerificationData: {
    vkeyHash: string
    proof: string
    publicInputs: readonly string[]
  }
  committedInputs: string
  serviceConfig: {
    validityPeriodInSeconds: number
    domain: string
    scope: string
    devMode: boolean
  }
}

/**
 * Encode the `proofData` argument for `issue()`: the proof verification params encoded per
 * PolicyEvaluatorV2's schema-2 layout. Policies pinned to another evaluator schema need that
 * schema's encoding instead; `getRequirements` rejects such policies before a proof request
 * is ever built.
 *
 * The params must have been derived for the policy's own scope, from `policyScope(policyId)`,
 * against the contract's `domain()`. A manually built scope string risks not matching what the
 * contract expects to verify.
 */
export function encodeIssueProofData(params: IssueProofVerificationParams): `0x${string}` {
  return encodeAbiParameters(PROOF_DATA_ABI, [params] as never)
}

/**
 * Typed bindings for the ZKPassportCredentials contract.
 */
export class CredentialsClient {
  private readonly client: CredentialsReadClient
  public readonly address: `0x${string}`
  private readonly deployBlock?: bigint

  constructor(options: {
    client: CredentialsReadClient
    address: `0x${string}`
    deployBlock?: bigint
  }) {
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

  async getPolicy(policyId: bigint): Promise<CredentialPolicy> {
    return (await this.read("getPolicy", [policyId])) as CredentialPolicy
  }

  /** Get a policy, or null when no policy has the id. */
  async findPolicy(policyId: bigint): Promise<CredentialPolicy | null> {
    try {
      return await this.getPolicy(policyId)
    } catch (error) {
      if (isPolicyNotFound(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * Decode a policy's requirements, so the request a client builds is
   * derived from exactly what issue() will enforce.
   */
  async getRequirements(policy: CredentialPolicy): Promise<CredentialPolicyRequirements> {
    const evaluatorRead = (functionName: string, args: readonly unknown[]) =>
      this.client.readContract({
        address: policy.evaluator,
        abi: PolicyEvaluatorV2Abi,
        functionName,
        args,
      } as never)

    const schemaVersion = (await evaluatorRead("schemaVersion", [])) as bigint
    if (schemaVersion !== 2n) {
      throw new Error(
        `Unsupported policy evaluator schema ${schemaVersion} at ${policy.evaluator}; this SDK decodes schema 2.`,
      )
    }

    const decoded = (await evaluatorRead("decodeRequirements", [policy.requirements])) as Omit<
      CredentialPolicyRequirements,
      "sanctionsMode" | "facematchMode" | "allowedVerificationMethods"
    > & {
      sanctionsMode: number
      faceMatchMode: number
      allowedVerificationMethods: readonly bigint[]
    }

    return {
      minAge: decoded.minAge,
      sanctionsMode: SANCTIONS_MODES[decoded.sanctionsMode],
      facematchMode: FACEMATCH_MODES[decoded.faceMatchMode],
      includedNationalities: decoded.includedNationalities,
      excludedNationalities: decoded.excludedNationalities,
      allowedVerificationMethods: decoded.allowedVerificationMethods.map(Number),
    }
  }

  /**
   * Whether the policy's evaluator accepts mock-document proofs. Submit it as the `devMode` in
   * issue()'s proof params: an evaluator that is not in dev mode reverts any submission claiming
   * it. Which registries a proof is rooted in is a separate question, set by the chain.
   */
  async getDevMode(policy: CredentialPolicy): Promise<boolean> {
    return (await this.client.readContract({
      address: policy.evaluator,
      abi: PolicyEvaluatorV2Abi,
      functionName: "devMode",
    } as never)) as boolean
  }

  /**
   * The nullifier type the policy's evaluator requires of proofs for policies that enforce
   * uniqueness (`policy.enforceUniqueness`); other policies leave the type unconstrained. The
   * type is matched exactly, mock types included. Under `NONE` no uniqueness policy can issue.
   */
  async getUniqueIdentifierType(policy: CredentialPolicy): Promise<NullifierType> {
    return (await this.client.readContract({
      address: policy.evaluator,
      abi: PolicyEvaluatorV2Abi,
      functionName: "uniqueIdentifierType",
    } as never)) as NullifierType
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
   * True while the wallet is banned from the policy by its owner or an issuer; issue() and
   * ownerIssue() revert for banned wallets until unbanned.
   */
  async banned(wallet: `0x${string}`, policyId: bigint): Promise<boolean> {
    return (await this.read("banned", [wallet, policyId])) as boolean
  }

  /**
   * True while the account is an issuer of the policy: added by its owner via addIssuer() and not
   * removed since. Issuers may issue credentials without a proof, and ban and unban wallets, as
   * the owner can.
   */
  async isIssuer(issuer: `0x${string}`, policyId: bigint): Promise<boolean> {
    return (await this.read("isIssuer", [issuer, policyId])) as boolean
  }

  /**
   * The proof scope for a policy.
   */
  async policyScope(policyId: bigint): Promise<string> {
    return (await this.read("policyScope", [policyId])) as string
  }

  /**
   * The credentials contract's domain, which issue() verifies proofs against.
   */
  async domain(): Promise<string> {
    return (await this.read("domain", [])) as string
  }

  /**
   * Enumerate policies from `PolicyCreated` logs. Policy ids are `keccak256(creator, salt)`,
   * so the credentials contract has no on-chain list; logs are the only on-chain enumeration. Apps that
   * need frequent or large listings should index `PolicyCreated` themselves instead.
   *
   * The scan starts at `fromBlock`, or the client's `deployBlock` when omitted; constructing
   * the client without either is an error. It ends at `toBlock`, or the current block.
   */
  async listPolicies(
    filter: { owner?: `0x${string}` } & LogScanRange = {},
  ): Promise<CredentialPolicySummary[]> {
    const scan = await this.resolveLogScan("listPolicies", filter)
    const args = filter.owner !== undefined ? { owner: filter.owner } : undefined
    const logs = (await this.getLogsInChunks(POLICY_CREATED_EVENT, args, scan)) as {
      args: CredentialPolicySummary
    }[]
    return logs.map((log) => ({ policyId: log.args.policyId, owner: log.args.owner }))
  }

  /** List a policy's current issuers. Scans the same blocks as `listPolicies`. */
  async listIssuers(policyId: bigint, range: LogScanRange = {}): Promise<`0x${string}`[]> {
    const issuerships = await this.listCurrentIssuerships("listIssuers", { policyId }, range)
    return issuerships.map((issuership) => issuership.issuer)
  }

  /**
   * List the policies an address is currently an issuer of. Scans the same blocks as
   * `listPolicies`.
   */
  async listPoliciesWithIssuer(issuer: `0x${string}`, range: LogScanRange = {}): Promise<bigint[]> {
    const issuerships = await this.listCurrentIssuerships(
      "listPoliciesWithIssuer",
      { issuer },
      range,
    )
    return issuerships.map((issuership) => issuership.policyId)
  }

  /**
   * List the wallets currently banned from a policy, with the block each ban landed in. Scans the
   * same blocks as `listPolicies`.
   */
  async listBannedWallets(policyId: bigint, range: LogScanRange = {}): Promise<BannedWallet[]> {
    const scan = await this.resolveLogScan("listBannedWallets", range)
    const [bans, unbans] = await Promise.all([
      this.getLogsInChunks(WALLET_BANNED_EVENT, { policyId }, scan),
      this.getLogsInChunks(WALLET_UNBANNED_EVENT, { policyId }, scan),
    ])

    const current = this.replayLogs(bans as BanLog[], unbans as BanLog[], (log) =>
      log.args.wallet.toLowerCase(),
    )
    return current.map((log) => ({ wallet: log.args.wallet, bannedAtBlock: log.blockNumber }))
  }

  private async resolveLogScan(method: string, range: LogScanRange) {
    const fromBlock = range.fromBlock ?? this.deployBlock
    if (fromBlock === undefined) {
      throw new Error(
        `${method} needs a starting block: pass fromBlock, or construct CredentialsClient with the credentials contract's deployBlock.`,
      )
    }

    const blockRange = range.blockRange ?? 10_000n
    if (blockRange < 1n) throw new Error("blockRange must be at least 1")

    const toBlock = range.toBlock ?? (await this.client.getBlockNumber())
    return { fromBlock, toBlock, blockRange }
  }

  private async getLogsInChunks(
    event: AbiEvent,
    args: Record<string, unknown> | undefined,
    scan: { fromBlock: bigint; toBlock: bigint; blockRange: bigint },
  ): Promise<unknown[]> {
    const logs: unknown[] = []
    for (let start = scan.fromBlock; start <= scan.toBlock; start += scan.blockRange) {
      const end =
        start + scan.blockRange - 1n < scan.toBlock ? start + scan.blockRange - 1n : scan.toBlock
      const chunk = await this.client.getLogs({
        address: this.address,
        event,
        args,
        fromBlock: start,
        toBlock: end,
      } as never)
      logs.push(...(chunk as unknown[]))
    }
    return logs
  }

  private async listCurrentIssuerships(
    method: string,
    args: { policyId: bigint } | { issuer: `0x${string}` },
    range: LogScanRange,
  ): Promise<IssuerLog["args"][]> {
    const scan = await this.resolveLogScan(method, range)
    const [added, removed] = await Promise.all([
      this.getLogsInChunks(ISSUER_ADDED_EVENT, args, scan),
      this.getLogsInChunks(ISSUER_REMOVED_EVENT, args, scan),
    ])

    const current = this.replayLogs(
      added as IssuerLog[],
      removed as IssuerLog[],
      (log) => `${log.args.policyId}:${log.args.issuer.toLowerCase()}`,
    )
    return current.map((log) => ({ policyId: log.args.policyId, issuer: log.args.issuer }))
  }

  /**
   * Replay additions and removals in chain order, and return the addition still in force for
   * each key.
   */
  private replayLogs<T extends OrderedLog>(
    added: T[],
    removed: T[],
    keyOf: (log: T) => string,
  ): T[] {
    const changes = [
      ...added.map((log) => ({ log, isAdded: true })),
      ...removed.map((log) => ({ log, isAdded: false })),
    ].sort((a, b) =>
      a.log.blockNumber === b.log.blockNumber
        ? a.log.logIndex - b.log.logIndex
        : a.log.blockNumber < b.log.blockNumber
          ? -1
          : 1,
    )

    const current = new Map<string, T>()
    for (const { log, isAdded } of changes) {
      if (isAdded) {
        current.set(keyOf(log), log)
      } else {
        current.delete(keyOf(log))
      }
    }
    return [...current.values()]
  }

  /**
   * Assemble the ready-to-send issue() call for a policy from a verified proof, encoding the
   * proof data via `encodeIssueProofData`.
   *
   * Issuance is permissionless: any sender may submit, and the credential lands on the wallet the
   * proof is bound to. Renewal is achieved through the same call: issuing again extends
   * `heldUntil`.
   *
   * On-chain preconditions the transaction must satisfy or `issue()` reverts:
   * - The proof must be bound to the recipient wallet and to the chain the credentials contract
   *   lives on (request the proof with those bindings).
   * - `devMode` is accepted; mock-document proofs (dev mode) verify only against testnet
   *   registries, which contain the mock certificates. On mainnet deployments they fail the
   *   certificate root check.
   * - The proof must be at most 1 day old at inclusion time.
   * - The recipient wallet must not be banned. A ban blocks issuance until the policy owner or
   *   an issuer unbans the wallet. Only relevant for `ownerBannable` policies.
   * - The policy must exist, not be retired, and the contract not paused.
   */
  buildIssueCall(options: {
    policyId: bigint
    params: IssueProofVerificationParams
  }): CredentialIssueCall {
    return this.call("issue", [options.policyId, encodeIssueProofData(options.params)] as const)
  }

  private call<F extends string, A>(functionName: F, args: A): CredentialsCall<F, A> {
    return { address: this.address, functionName, abi: ZKPassportCredentialsAbi, args }
  }

  /**
   * Assemble the createPolicy() call. The sender becomes the policy owner; the policy id is
   * `keccak256(creator, salt)` (predictable via `computePolicyId`), so a creator reusing a salt
   * reverts. Requirements are encoded per the current evaluator's schema and validated on-chain
   * at creation. `enforceUniqueness` and the three owner-privilege flags are immutable
   * afterwards; the owner flags default to false.
   */
  buildCreatePolicyCall(options: {
    /** Creator-scoped namespace for the policy id. */
    salt: `0x${string}`
    requirements: CredentialPolicyRequirements
    /** Seconds a credential stays valid after each issuance or renewal; must be non-zero. */
    credentialDuration: bigint
    /** Display metadata for the policy's token, served by uri(policyId). */
    metadataURL: string
    /**
     * Issue at most one credential per document. No credential can issue if the current
     * evaluator's `uniqueIdentifierType` is `NONE`.
     */
    enforceUniqueness: boolean
    /** Allow proofless issuance by the owner and its issuers via ownerIssue() and ownerIssueBatch(). */
    ownerIssuable?: boolean
    /**
     * Allow the owner and its issuers to ban wallets (removing any standing credential) via ban()
     * and banBatch().
     */
    ownerBannable?: boolean
    /**
     * Allow the owner to replace requirements, evaluator and credential duration via
     * setRequirements(), migrateEvaluator() and setCredentialDuration().
     */
    ownerEditable?: boolean
  }): CredentialsCall<
    "createPolicy",
    readonly [`0x${string}`, `0x${string}`, bigint, string, boolean, boolean, boolean, boolean]
  > {
    return this.call("createPolicy", [
      options.salt,
      encodeCredentialPolicyRequirements(options.requirements),
      options.credentialDuration,
      options.metadataURL,
      options.enforceUniqueness,
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
    requirements: CredentialPolicyRequirements,
  ): CredentialsCall<"setRequirements", readonly [bigint, `0x${string}`]> {
    return this.call("setRequirements", [
      policyId,
      encodeCredentialPolicyRequirements(requirements),
    ] as const)
  }

  /**
   * Assemble the migrateEvaluator() call, moving a policy to the current policy evaluator with
   * new requirements, which that evaluator validates on-chain. Owner-only, and only for
   * `ownerEditable` policies. Already-issued credentials and nullifier bindings are untouched.
   */
  buildMigrateEvaluatorCall(
    policyId: bigint,
    requirements: CredentialPolicyRequirements,
  ): CredentialsCall<"migrateEvaluator", readonly [bigint, `0x${string}`]> {
    return this.call("migrateEvaluator", [
      policyId,
      encodeCredentialPolicyRequirements(requirements),
    ] as const)
  }

  /**
   * Assemble the setCredentialDuration() call, changing how long credentials stay valid from
   * their next issuance or renewal on. Owner-only, and only for `ownerEditable` policies;
   * already-issued credentials keep their expiry.
   */
  buildSetCredentialDurationCall(
    policyId: bigint,
    credentialDuration: bigint,
  ): CredentialsCall<"setCredentialDuration", readonly [bigint, bigint]> {
    return this.call("setCredentialDuration", [policyId, credentialDuration] as const)
  }

  /** Assemble the setMetadataURL() call, updating a policy's display metadata URL. Owner-only. */
  buildSetMetadataURLCall(
    policyId: bigint,
    url: string,
  ): CredentialsCall<"setMetadataURL", readonly [bigint, string]> {
    return this.call("setMetadataURL", [policyId, url] as const)
  }

  /**
   * Assemble the retire() call, permanently stopping new issuance and renewals for a policy.
   * Owner-only and one-way; existing credentials stay valid until they expire.
   */
  buildRetireCall(policyId: bigint): CredentialsCall<"retire", readonly [bigint]> {
    return this.call("retire", [policyId] as const)
  }

  /**
   * Assemble the ownerIssue() call, issuing (or extending) a credential without a proof.
   * Owner or issuer only, and only for `ownerIssuable` policies; reverts for banned wallets and
   * retired policies. Owner issuance never touches nullifier bindings, so on `enforceUniqueness`
   * policies it bypasses one-per-document sybil protection.
   */
  buildOwnerIssueCall(
    wallet: `0x${string}`,
    policyId: bigint,
  ): CredentialsCall<"ownerIssue", readonly [`0x${string}`, bigint]> {
    return this.call("ownerIssue", [wallet, policyId] as const)
  }

  /**
   * Assemble the ownerIssueBatch() call, issuing (or extending) credentials for several wallets
   * as ownerIssue() does. All or nothing: the transaction reverts if any wallet cannot be
   * issued to.
   */
  buildOwnerIssueBatchCall(
    wallets: readonly `0x${string}`[],
    policyId: bigint,
  ): CredentialsCall<"ownerIssueBatch", readonly [readonly `0x${string}`[], bigint]> {
    return this.call("ownerIssueBatch", [wallets, policyId] as const)
  }

  /**
   * Assemble the addIssuer() call, letting an account issue credentials without a proof, and
   * ban and unban wallets, as the owner can. Owner-only, and only for `ownerIssuable` policies.
   */
  buildAddIssuerCall(
    issuer: `0x${string}`,
    policyId: bigint,
  ): CredentialsCall<"addIssuer", readonly [`0x${string}`, bigint]> {
    return this.call("addIssuer", [issuer, policyId] as const)
  }

  /**
   * Assemble the removeIssuer() call, stopping an issuer from acting for the policy. Owner-only;
   * the credentials the issuer issued and the bans it placed stay.
   */
  buildRemoveIssuerCall(
    issuer: `0x${string}`,
    policyId: bigint,
  ): CredentialsCall<"removeIssuer", readonly [`0x${string}`, bigint]> {
    return this.call("removeIssuer", [issuer, policyId] as const)
  }

  /**
   * Assemble the renounce() call, giving up the sender's own credential for a policy.
   * Renouncing never bans: the holder may re-prove and re-issue at will. The nullifier stays
   * bound to the wallet, so the document can only ever re-credential the same wallet for
   * this policy.
   */
  buildRenounceCall(policyId: bigint): CredentialsCall<"renounce", readonly [bigint]> {
    return this.call("renounce", [policyId] as const)
  }

  /**
   * Assemble the ban() call, banning a wallet from a policy effective immediately: any
   * standing credential is removed in the same transaction, and issuance and renewal stay
   * blocked until unban(). Owner or issuer only, and only for `ownerBannable` policies; reverts
   * if the wallet is already banned.
   */
  buildBanCall(
    wallet: `0x${string}`,
    policyId: bigint,
  ): CredentialsCall<"ban", readonly [`0x${string}`, bigint]> {
    return this.call("ban", [wallet, policyId] as const)
  }

  /**
   * Assemble the banBatch() call, banning several wallets as ban() does and skipping any wallet
   * that is already banned.
   */
  buildBanBatchCall(
    wallets: readonly `0x${string}`[],
    policyId: bigint,
  ): CredentialsCall<"banBatch", readonly [readonly `0x${string}`[], bigint]> {
    return this.call("banBatch", [wallets, policyId] as const)
  }

  /**
   * Assemble the unban() call, lifting a ban placed on a wallet. Owner or issuer only; reverts if
   * the wallet is not banned.
   */
  buildUnbanCall(
    wallet: `0x${string}`,
    policyId: bigint,
  ): CredentialsCall<"unban", readonly [`0x${string}`, bigint]> {
    return this.call("unban", [wallet, policyId] as const)
  }

  /**
   * Assemble the unbanBatch() call, lifting the bans on several wallets as unban() does and
   * skipping any wallet that is not banned.
   */
  buildUnbanBatchCall(
    wallets: readonly `0x${string}`[],
    policyId: bigint,
  ): CredentialsCall<"unbanBatch", readonly [readonly `0x${string}`[], bigint]> {
    return this.call("unbanBatch", [wallets, policyId] as const)
  }
}

/**
 * Ready-to-send ZKPassportCredentials call assembled by a CredentialsClient. `address` is the
 * credentials contract address; the fields keep viem's naming so the object spreads straight into
 * writeContract/simulateContract, or submits through `submitCredentialsCall`.
 */
export type CredentialsCall<F extends string = string, A = readonly unknown[]> = {
  address: `0x${string}`
  functionName: F
  abi: typeof ZKPassportCredentialsAbi
  args: A
}

/**
 * Ready-to-send ZKPassportCredentials.issue() call. `address` is the credentials
 * contract address; the field keeps viem's naming so the object spreads straight into
 * writeContract/simulateContract.
 */
export type CredentialIssueCall = {
  address: `0x${string}`
  functionName: "issue"
  abi: typeof ZKPassportCredentialsAbi
  /** policyId plus the proof data pre-encoded per the policy's evaluator schema. */
  args: readonly [bigint, `0x${string}`]
}

export type CredentialsContext = {
  chain: Chain
  publicClient: PublicClient
  credentials: CredentialsClient
}

/**
 * Read context for the canonical credentials contract on a chain: a public client on the
 * chain's default RPC plus a CredentialsClient bound to it. The address and deploy block
 * are derived from the viem chain's id, so chains without a recorded
 * deployment are rejected here.
 */
export function createCredentialsContext(chain: Chain): CredentialsContext {
  const publicClient = createPublicClient({ chain, transport: http() })
  const supportedChain = getChainFromId(chain.id)
  const credentials = new CredentialsClient({
    client: publicClient,
    address: getCredentialsAddress(supportedChain),
    deployBlock: getCredentialsDeployBlock(supportedChain),
  })
  return { chain, publicClient, credentials }
}

type SubmittableCall = {
  address: `0x${string}`
  functionName: string
  abi: readonly unknown[]
  args: readonly unknown[]
}

async function submitCall(
  ctx: CredentialsContext,
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

function isPolicyNotFound(error: unknown): boolean {
  if (!(error instanceof BaseError)) {
    return false
  }
  const revert = error.walk(
    (cause) =>
      cause instanceof ContractFunctionRevertedError &&
      cause.data?.errorName === "ZKPassportCredentials__PolicyNotFound",
  )
  return revert !== null
}

/**
 * Submit ZKPassportCredentials.issue() and wait for inclusion. Any sender
 * works — the credential lands on the wallet the proof is bound to — so a
 * relayer or sponsored-gas flow replaces this function and nothing upstream
 * changes. The wallet client must already be on the context's chain.
 */
export async function submitIssueCall(
  ctx: CredentialsContext,
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
 * Submit a CredentialsClient-assembled contract call and wait for inclusion. Unlike issue(), the
 * owner operations are permissioned: the wallet must be the policy's owner (or, for
 * renounce(), the holder giving up their own credential) or the transaction reverts. The
 * wallet client must already be on
 * the context's chain.
 */
export async function submitCredentialsCall(
  ctx: CredentialsContext,
  call: CredentialsCall<string, readonly unknown[]>,
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

export { ZKPassportCredentialsAbi, PolicyEvaluatorV1Abi, PolicyEvaluatorV2Abi }
export { getCredentialsChain, getCredentialsChains, getCredentialsAddress } from "./deployments"
export { credentialRequirementsFromQuery, type UnsupportedQueryCheck } from "./query-requirements"
