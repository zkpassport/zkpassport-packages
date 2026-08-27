import { AttestClient, ZKPassportAttestAbi } from "@zkpassport/sdk"
import type { AttestPolicy, AttestPolicySummary } from "@zkpassport/sdk"
import { createPublicClient, http, toHex, type Chain, type PublicClient } from "viem"
import type { DemoConfig } from "./config"
import type { WriteRequest } from "./wallet"

export type AttestContext = {
  publicClient: PublicClient
  attest: AttestClient
  deployBlock: bigint
}

export type PolicyView = AttestPolicySummary & { policy: AttestPolicy }

export function createAttestContext(config: DemoConfig, chain: Chain): AttestContext {
  const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) })
  return {
    publicClient,
    attest: new AttestClient({ client: publicClient, address: config.registry }),
    deployBlock: config.deployBlock,
  }
}

export async function listPoliciesWithDetails(ctx: AttestContext): Promise<PolicyView[]> {
  const summaries = await ctx.attest.listPolicies({ fromBlock: ctx.deployBlock })
  return Promise.all(
    summaries.map(async (summary) => ({
      ...summary,
      policy: await ctx.attest.getPolicy(summary.policyId),
    })),
  )
}

export type CreatePolicyForm = {
  salt: `0x${string}`
  validityPeriodSeconds: bigint
  unique: boolean
  saltedNullifierOnly: boolean
  minAge: number
  sanctionsCheck: boolean
  excludedCountries: string[]
  metadataURL: string
}

export function randomSalt(): `0x${string}` {
  return toHex(crypto.getRandomValues(new Uint8Array(32)))
}

export function createPolicyRequest(registry: `0x${string}`, form: CreatePolicyForm): WriteRequest {
  return {
    address: registry,
    abi: ZKPassportAttestAbi,
    functionName: "createPolicy",
    args: [
      form.salt,
      form.validityPeriodSeconds,
      form.unique,
      form.saltedNullifierOnly,
      form.minAge,
      form.sanctionsCheck,
      form.excludedCountries,
      form.metadataURL,
    ],
  }
}

export function retireRequest(registry: `0x${string}`, policyId: bigint): WriteRequest {
  return { address: registry, abi: ZKPassportAttestAbi, functionName: "retire", args: [policyId] }
}

export function revokeRequest(
  registry: `0x${string}`,
  wallet: `0x${string}`,
  policyId: bigint,
): WriteRequest {
  return {
    address: registry,
    abi: ZKPassportAttestAbi,
    functionName: "revoke",
    args: [wallet, policyId],
  }
}

export async function guardianOf(ctx: AttestContext): Promise<`0x${string}`> {
  return (await ctx.publicClient.readContract({
    address: ctx.attest.address,
    abi: ZKPassportAttestAbi,
    functionName: "guardian",
  } as never)) as `0x${string}`
}
