import type { PublicClient } from "viem"
import { encodeAbiParameters, getAbiItem } from "viem"
import { NullifierType } from "@zkpassport/utils"
import type { FacematchMode, ProofResult } from "@zkpassport/utils"
import type { RequestedNullifierType } from "./types"
import { SolidityVerifier } from "./solidity-verifier"
import { ZKPassportCredentialsAbi } from "./assets/abi/zkpassport-credentials"
import { PolicyEvaluatorV1Abi } from "./assets/abi/policy-evaluator-v1"

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
   * When true, the policy owner may revoke a holder's credential, which also bans the
   * wallet from the policy until the owner unbans it. Self-revocation is always allowed.
   */
  ownerRevocable: boolean
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
 * - Country lists (`includedNationalities` and `excludedNationalities`) must be ISO 3166-1
 *   alpha-3, sorted ascending; an empty list disables that check.
 */
export type AttestPolicyRequirements = {
  /**
   * Any `uniqueIdentifierType` value other than `NONE` requires the proof to carry exactly that
   * nullifier type.
   */
  uniqueIdentifierType: RequestedNullifierType
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

// The evaluator's PolicyNullifierType is a three-member enum (non-salted, salted, none), so
// its NONE is 2 while the app-side NullifierType puts NONE at 4 behind the mock types.
const POLICY_NULLIFIER_TYPES: Record<number, RequestedNullifierType> = {
  0: NullifierType.NON_SALTED,
  1: NullifierType.SALTED,
  2: NullifierType.NONE,
}

const FACEMATCH_MODES: Record<number, FacematchMode | undefined> = {
  0: undefined,
  1: "regular",
  2: "strict",
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
 * Reads execute through the provided client. Writes follow the SolidityVerifier pattern (the
 * consumer signs with their own wallet stack).
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
   * derived from exactly what issue() will enforce. Fails on an evaluator schema this SDK version
   * does not know, rather than building a wrong proof request.
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
      uniqueIdentifierType: POLICY_NULLIFIER_TYPES[decoded.uniqueIdentifierType],
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
   * Unix timestamp (seconds, as bigint) the credential is valid until; 0 means never issued or
   * revoked.
   */
  async heldUntil(wallet: `0x${string}`, policyId: bigint): Promise<bigint> {
    return (await this.read("heldUntil", [wallet, policyId])) as bigint
  }

  /**
   * True while the wallet is banned from the policy by an owner revocation; issue() and ownerIssue()
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
   * Enumerate policies from `PolicyCreated` logs. Policy ids are `keccak256(creator, salt)`,
   * so the registry has no on-chain list; logs are the only on-chain enumeration. The scan is
   * chunked into `blockRange`-sized `getLogs` calls (default 10,000 blocks) to stay under RPC
   * provider range caps, so scanning a long history costs one request per window. Apps that
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
   * - The proof must be at most 1 hour old at inclusion time.
   * - The recipient wallet must not be banned. An owner revocation bans it until the policy owner
   *   unbans. Only relevant for `ownerRevocable` policies.
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
}
