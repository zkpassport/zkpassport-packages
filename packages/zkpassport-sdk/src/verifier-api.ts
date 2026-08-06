import type { ProofResult, Query, QueryResult } from "@zkpassport/utils"
import { VERIFIER_API_BASE_URL } from "./constants"
import type { VerificationResult } from "./types"

// Returns null when the API gave no verdict (unreachable, timed out, server error),
// so callers can fall back to their own result instead of reporting "not verified".
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
}): Promise<VerificationResult | null> {
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
    if (response.status >= 500) {
      console.warn(`Verifier API error (status ${response.status})`)
      return null
    }
    const body = (await response.json().catch(() => null)) as
      | (VerificationResult & { error?: string })
      | null
    if (!body || typeof body.verified !== "boolean") {
      console.warn(`Unexpected verifier API response (status ${response.status})`)
      return null
    }
    if (!body.verified) {
      console.warn("Verifier API did not verify the proofs:", body.error)
      return {
        uniqueIdentifier: undefined,
        uniqueIdentifierType: undefined,
        verified: false,
        queryResultErrors: body.queryResultErrors,
      }
    }
    return {
      uniqueIdentifier: body.uniqueIdentifier,
      uniqueIdentifierType: body.uniqueIdentifierType,
      verified: true,
    }
  } catch (e) {
    console.warn("Verifier API call failed:", e)
    return null
  }
}
