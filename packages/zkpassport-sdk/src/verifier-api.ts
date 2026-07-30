import type { NullifierType, ProofResult, Query, QueryResult } from "@zkpassport/utils"
import { MAX_SUPPORTED_CIRCUIT_VERSION, VERIFIER_API_BASE_URL } from "./constants"
import type { QueryResultErrors } from "./types"

type VerificationResult = {
  uniqueIdentifier: string | undefined
  uniqueIdentifierType: NullifierType | undefined
  verified: boolean
  queryResultErrors?: Partial<QueryResultErrors>
}

export function isCircuitVersionSupported(circuitVersion?: string): boolean {
  const version = circuitVersion?.split(".").map(Number)
  if (!version || version.length !== 3 || version.some(Number.isNaN)) return true
  const max = MAX_SUPPORTED_CIRCUIT_VERSION.split(".").map(Number)
  for (let i = 0; i < version.length; i++) {
    if (version[i] !== max[i]) return version[i] < max[i]
  }
  return true
}

export async function verifyWithVerifierApi({
  proofs,
  originalQuery,
  queryResult,
  domain,
  validity,
  scope,
  devMode,
  oprfKeyId,
}: {
  proofs: Array<ProofResult>
  originalQuery: Query
  queryResult: QueryResult
  domain: string
  validity?: number
  scope?: string
  devMode?: boolean
  oprfKeyId?: string
}): Promise<VerificationResult> {
  const notVerified = {
    uniqueIdentifier: undefined,
    uniqueIdentifierType: undefined,
    verified: false,
  }
  try {
    const response = await fetch(`${VERIFIER_API_BASE_URL}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proofs,
        originalQuery,
        queryResult,
        serviceConfig: { domain, scope, validityPeriodInSeconds: validity, devMode },
        oprfKeyId,
      }),
      signal: AbortSignal.timeout(60000),
    })
    const body = (await response.json().catch(() => null)) as
      | (VerificationResult & { error?: string })
      | null
    if (!body || typeof body.verified !== "boolean") {
      throw new Error(`Unexpected verifier API response (status ${response.status})`)
    }
    if (!body.verified) {
      console.warn("Verifier API did not verify the proofs:", body.error)
      return { ...notVerified, queryResultErrors: body.queryResultErrors }
    }
    return {
      uniqueIdentifier: body.uniqueIdentifier,
      uniqueIdentifierType: body.uniqueIdentifierType,
      verified: true,
    }
  } catch (e) {
    console.warn("Verifier API call failed:", e)
    return notVerified
  }
}
