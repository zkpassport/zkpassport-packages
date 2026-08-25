import type { PublicClient } from "viem"
import { getAbiItem } from "viem"
import type { ProofResult } from "@zkpassport/utils"
import { SolidityVerifier } from "./solidity-verifier"
import type { SolidityVerifierParameters } from "./types"
import { ZKPassportAttestAbi } from "./assets/abi/zkpassport-attest"
import { PolicyValidationHookAbi } from "./assets/abi/policy-validation-hook"

/** Structural slice of viem's PublicClient — anything with these two methods works. */
export type AttestReadClient = Pick<PublicClient, "readContract" | "getLogs">

/** Mirrors ZKPassportAttest.Policy (packages/attest-contracts/src/ZKPassportAttest.sol). */
export type AttestPolicy = {
  owner: `0x${string}`
  validityPeriod: bigint
  unique: boolean
  saltedNullifierOnly: boolean
  minAge: number
  sanctionsCheck: boolean
  excludedCountries: readonly string[]
  metadataURL: string
  hook: `0x${string}`
  retiredAt: bigint
}

export type AttestPolicySummary = {
  policyId: bigint
  owner: `0x${string}`
  hook: `0x${string}`
}

const POLICY_CREATED_EVENT = getAbiItem({ abi: ZKPassportAttestAbi, name: "PolicyCreated" })

/**
 * Typed bindings for the ZKPassportAttest credential registry.
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
      abi: ZKPassportAttestAbi,
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

  async hookFor(policyId: bigint): Promise<`0x${string}`> {
    return (await this.getPolicy(policyId)).hook
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
      hook: log.args.hook,
    }))
  }

  /**
   * Introspect a hook and check it belongs to this registry and policy.
   * Returns false (never throws) when the address is not a hook at all —
   * an EOA, a non-contract, or a contract without erc1155()/tokenId().
   */
  async verifyHook(hook: `0x${string}`, policyId: bigint): Promise<boolean> {
    const readHook = (functionName: string) =>
      this.client.readContract({
        address: hook,
        abi: PolicyValidationHookAbi,
        functionName,
      } as never)
    try {
      const [erc1155, tokenId] = await Promise.all([readHook("erc1155"), readHook("tokenId")])
      return (
        (erc1155 as string).toLowerCase() === this.address.toLowerCase() &&
        (tokenId as bigint) === policyId
      )
    } catch {
      return false
    }
  }

  /**
   * Call details for ZKPassportAttest.issue(wallet, policyId, params).
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
    abi: typeof ZKPassportAttestAbi
  } {
    return { address: this.address, functionName: "issue", abi: ZKPassportAttestAbi }
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
