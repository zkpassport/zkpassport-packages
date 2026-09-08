import type { PublicClient } from "viem"
import { getAbiItem } from "viem"
import type { FacematchMode, ProofResult } from "@zkpassport/utils"
import type { RequestedNullifierType } from "./types"
import { SolidityVerifier } from "./solidity-verifier"
import type { SolidityVerifierParameters } from "./types"
import { ZKPassportCredentialsAbi } from "./assets/abi/zkpassport-credentials"
import { PolicyEvaluatorV1Abi } from "./assets/abi/policy-evaluator-v1"

/** Structural slice of viem's PublicClient — anything with these two methods works. */
export type AttestReadClient = Pick<PublicClient, "readContract" | "getLogs">

/** Mirrors ZKPassportCredentials.Policy (packages/attest-contracts/src/ZKPassportCredentials.sol). */
export type AttestPolicy = {
  owner: `0x${string}`
  credentialDuration: bigint
  /** When true, the policy owner may issue credentials directly via grant(), without a proof. */
  ownerGrantable: boolean
  evaluator: `0x${string}`
  /** Opaque requirements bytes; the schema is owned by the policy's evaluator. */
  requirements: `0x${string}`
  metadataURL: string
  retiredAt: bigint
}

/**
 * PolicyEvaluatorV1.PolicyRequirements, decoded through the evaluator itself.
 * minAge 0 disables the age check; a non-NONE uniqueIdentifierType requires
 * the proof to carry exactly that nullifier type, and enforceUniqueness turns
 * on one-per-document dedup. Country lists are ISO 3166-1 alpha-3, sorted
 * ascending; an empty list disables that check.
 */
export type AttestPolicyRequirements = {
  uniqueIdentifierType: RequestedNullifierType
  enforceUniqueness: boolean
  minAge: number
  /** undefined when the policy does not require a sanctions check */
  sanctionsMode?: "normal" | "strict"
  /** undefined when the policy does not require FaceMatch */
  facematchMode?: FacematchMode
  includedNationalities: readonly string[]
  excludedNationalities: readonly string[]
}

/** PolicyEvaluatorV1.sol's SanctionsMode enum: NONE, NORMAL, STRICT. */
const SANCTIONS_MODES: Record<number, "normal" | "strict" | undefined> = {
  0: undefined,
  1: "normal",
  2: "strict",
}

/** The registry's FaceMatchMode enum: NONE, REGULAR, STRICT. */
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

/**
 * Typed bindings for the ZKPassportCredentials credential registry.
 * Reads execute through the provided client; writes follow the
 * SolidityVerifier pattern (the consumer signs with their own wallet stack).
 */
export class AttestClient {
  private readonly client: AttestReadClient
  public readonly address: `0x${string}`

  constructor(options: { client: AttestReadClient; address: `0x${string}` }) {
    this.client = options.client
    this.address = options.address
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
   * Decode a policy's requirements through its own evaluator, so the request a
   * client builds is derived from exactly what issue() will enforce. Fails
   * loudly on an evaluator schema this SDK version does not know, rather than
   * building a wrong proof request.
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
      "sanctionsMode" | "facematchMode"
    > & { sanctionsMode: number; faceMatchMode: number }
    return {
      uniqueIdentifierType: decoded.uniqueIdentifierType,
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
   * 1 while the wallet holds an unexpired credential, else 0. Expiry is
   * time-based: the balance drops to 0 the moment heldUntil passes, with
   * no burn and no Transfer event — do not index balances from events.
   */
  async balanceOf(wallet: `0x${string}`, policyId: bigint): Promise<bigint> {
    return (await this.read("balanceOf", [wallet, policyId])) as bigint
  }

  /**
   * Unix timestamp (seconds, as bigint) the credential is valid until;
   * 0 means never issued or revoked.
   */
  async heldUntil(wallet: `0x${string}`, policyId: bigint): Promise<bigint> {
    return (await this.read("heldUntil", [wallet, policyId])) as bigint
  }

  /**
   * The proof scope for a policy, read from the contract so it is
   * byte-identical to what issue() verifies. Never reimplemented locally.
   */
  async policyScope(policyId: bigint): Promise<string> {
    return (await this.read("policyScope", [policyId])) as string
  }

  /**
   * Enumerate policies from PolicyCreated logs (the registry has no on-chain
   * list). fromBlock defaults to 0n, which many RPC providers reject or cap
   * for getLogs — pass the registry's deployment block for production use.
   */
  async listPolicies(
    filter: { owner?: `0x${string}`; fromBlock?: bigint; toBlock?: bigint } = {},
  ): Promise<AttestPolicySummary[]> {
    const logs = await this.client.getLogs({
      address: this.address,
      event: POLICY_CREATED_EVENT,
      args: filter.owner !== undefined ? { owner: filter.owner } : undefined,
      fromBlock: filter.fromBlock ?? 0n,
      toBlock: filter.toBlock,
    } as never)
    return (logs as unknown as { args: AttestPolicySummary }[]).map((log) => ({
      policyId: log.args.policyId,
      owner: log.args.owner,
    }))
  }

  /**
   * Call details for ZKPassportCredentials.issue(policyId, params).
   * The consumer executes with their own wallet stack (viem writeContract,
   * ethers, etc.) — the SDK never signs. Issuance is permissionless: any
   * sender (a relayer included) may submit, and the credential lands on the
   * wallet the proof is bound to. Renewal is the same call: issuing again
   * extends heldUntil; there is no separate renew entrypoint.
   *
   * On-chain preconditions the transaction must satisfy or issue() reverts:
   * - the proof must be bound to the recipient wallet and to the chain the
   *   registry lives on (request the proof with those bindings)
   * - the proof's bound customData must be empty
   * - the proof must come from a real document (mock-document proofs revert);
   *   devMode itself is accepted — it selects which registry roots verify the
   *   proof, so testnet deployments need dev-mode proofs and mainnet ones not
   * - the proof must be at most 1 hour old at inclusion time
   * - the policy must exist, not be retired, and the registry not paused
   */
  getIssueDetails(): {
    address: `0x${string}`
    functionName: "issue"
    abi: typeof ZKPassportCredentialsAbi
  } {
    return { address: this.address, functionName: "issue", abi: ZKPassportCredentialsAbi }
  }

  /**
   * Build the ProofVerificationParams argument for issue() from an SDK proof.
   * Pass the scope obtained from policyScope(policyId) — never a locally
   * built string — so it is byte-identical to what the contract verifies.
   */
  static getIssueParameters(options: {
    proof: ProofResult
    domain: string
    scope: string
    validityPeriodInSeconds?: number
    devMode?: boolean
  }): SolidityVerifierParameters {
    return SolidityVerifier.getParameters({
      proof: options.proof,
      domain: options.domain,
      scope: options.scope,
      validityPeriodInSeconds: options.validityPeriodInSeconds,
      devMode: options.devMode ?? false,
    })
  }
}
