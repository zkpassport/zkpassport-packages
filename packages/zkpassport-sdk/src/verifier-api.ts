import type { NullifierType, ProofResult, Query, QueryResult } from "@zkpassport/utils"
import { SUPPORTED_BB_MAJOR_VERSIONS } from "./bb-verifier"
import { VERIFIER_API_BASE_URL } from "./constants"
import type { QueryResultErrors } from "./types"

type VerificationResult = {
  uniqueIdentifier: string | undefined
  uniqueIdentifierType: NullifierType | undefined
  verified: boolean
  queryResultErrors?: Partial<QueryResultErrors>
}

// Whether this SDK can verify the proof itself, rather than sending it to the
// verifier API. Proofs without a bbVersion are old and always verifiable here.
export function canVerifyLocally(proof: Pick<ProofResult, "bbVersion">): boolean {
  if (!proof.bbVersion) return true
  const major = Number(proof.bbVersion.split(".")[0])
  return SUPPORTED_BB_MAJOR_VERSIONS.some((v) => v === major)
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
