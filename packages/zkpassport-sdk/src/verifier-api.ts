import type { ProofResult, Query, QueryResult } from "@zkpassport/utils"
import { SUPPORTED_BB_MAJOR_VERSIONS } from "./bb-verifier"
import { VERIFIER_API_BASE_URL } from "./constants"
import type { VerificationResult } from "./types"

// Whether this SDK bundles a verifier for the proof's bb version. Not used to decide
// how to verify (verify() just attempts it) — only to give unsupported proofs a clear error.
export function canVerifyLocally(proof: Pick<ProofResult, "bbVersion">): boolean {
  if (!proof.bbVersion) return true
  const major = Number(proof.bbVersion.split(".")[0])
  return SUPPORTED_BB_MAJOR_VERSIONS.some((v) => v === major)
}

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
      // Includes 501: the API can't verify these proofs yet, it did not judge them
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
