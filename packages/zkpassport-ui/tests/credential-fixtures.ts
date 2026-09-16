import type { CredentialPolicy, CredentialsReadClient } from "@zkpassport/onchain-credentials"

export const REGISTRY = "0x1111111111111111111111111111111111111111" as const
export const WALLET = "0x2222222222222222222222222222222222222222" as const
export const EVALUATOR = "0x3333333333333333333333333333333333333333" as const
export const POLICY_ID = 42n
export const SCOPE = "attest:0x000000000000000000000000000000000000000000000000000000000000002a"
export const DOMAIN = "policy.example"

export const SAMPLE_POLICY: CredentialPolicy = {
  owner: WALLET,
  credentialDuration: 2592000n,
  ownerIssuable: false,
  ownerBannable: false,
  ownerEditable: false,
  evaluator: EVALUATOR,
  requirements: "0xabcd",
  metadataURL: "https://policy.example/kyc",
  retiredAt: 0n,
}

/**
 * decodeRequirements as the contract returns it: raw enum numbers. uniqueIdentifierType uses
 * the shared NullifierType numbering (0 non-salted, 1 salted, 2-3 mock twins, 4 none).
 */
export type RawRequirements = {
  uniqueIdentifierType: number
  enforceUniqueness: boolean
  minAge: number
  sanctionsMode: number
  faceMatchMode: number
  includedNationalities: string[]
  excludedNationalities: string[]
}

export const RAW_REQUIREMENTS: RawRequirements = {
  uniqueIdentifierType: 0,
  enforceUniqueness: true,
  minAge: 0,
  sanctionsMode: 0,
  faceMatchMode: 0,
  includedNationalities: [],
  excludedNationalities: [],
}

type ReadCall = { address: string; functionName: string; args?: readonly unknown[] }

/** A read-only client answering every call the request builder makes against the chain. */
export function stubChain(
  stub: {
    policy?: CredentialPolicy
    requirements?: Partial<RawRequirements>
    devMode?: boolean
  } = {},
) {
  const policy = stub.policy ?? SAMPLE_POLICY
  const requirements = { ...RAW_REQUIREMENTS, ...stub.requirements }
  const readCalls: ReadCall[] = []
  const client = {
    readContract: async (params: never) => {
      const call = params as ReadCall
      readCalls.push(call)
      switch (call.functionName) {
        case "getPolicy":
          return policy
        case "policyScope":
          return SCOPE
        case "domain":
          return DOMAIN
        case "schemaVersion":
          return 1n
        case "decodeRequirements":
          return requirements
        case "devMode":
          return stub.devMode ?? false
      }
      throw new Error(`unexpected read ${call.functionName}`)
    },
    getLogs: async () => [],
    getBlockNumber: async () => 100n,
  } as unknown as CredentialsReadClient
  return { client, readCalls }
}

/** Records the query builder calls a request makes, in order. */
export function fakeQueryBuilder() {
  const calls: { method: string; args: unknown[] }[] = []
  const qb: Record<string, unknown> = {}
  for (const method of ["gte", "in", "out", "sanctions", "facematch", "bind"]) {
    qb[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return qb
    }
  }
  qb.done = () => {
    calls.push({ method: "done", args: [] })
    return { url: "https://request.example" }
  }
  return { qb: qb as never, calls }
}
