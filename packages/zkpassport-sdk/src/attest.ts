import type { PublicClient } from "viem"
import { ZKPassportAttestAbi } from "./assets/abi/zkpassport-attest"

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

  async balanceOf(wallet: `0x${string}`, policyId: bigint): Promise<bigint> {
    return (await this.read("balanceOf", [wallet, policyId])) as bigint
  }

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
}
