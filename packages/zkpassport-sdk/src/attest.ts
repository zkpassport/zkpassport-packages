import type { PublicClient } from "viem"
import { getAbiItem } from "viem"
import type { ProofResult } from "@zkpassport/utils"
import type { RequestedNullifierType } from "./types"
import { SolidityVerifier } from "./solidity-verifier"
import type { SolidityVerifierParameters } from "./types"
import { ZKPassportCredentialsAbi } from "./assets/abi/zkpassport-credentials"

/** Structural slice of viem's PublicClient — anything with these two methods works. */
export type AttestReadClient = Pick<PublicClient, "readContract" | "getLogs">

/** Mirrors ZKPassportCredentials.Policy (packages/attest-contracts/src/ZKPassportCredentials.sol). */
export type AttestPolicy = {
  owner: `0x${string}`
  validityPeriod: bigint
  uniqueIdentifierType: RequestedNullifierType
  minAge: number
  sanctionsCheck: boolean
  excludedCountries: readonly string[]
  metadataURL: string
  retiredAt: bigint
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
   * Call details for ZKPassportCredentials.issue(wallet, policyId, params).
   * The consumer executes with their own wallet stack (viem writeContract,
   * ethers, etc.) — the SDK never signs. Renewal is the same call: issuing
   * again extends heldUntil; there is no separate renew entrypoint.
   *
   * On-chain preconditions the transaction must satisfy or issue() reverts:
   * - the proof must be bound to the exact `wallet` argument and to the
   *   chain the registry lives on (request the proof with those bindings)
   * - the proof's bound customData must be empty
   * - the proof must be generated in production mode (devMode always reverts)
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
