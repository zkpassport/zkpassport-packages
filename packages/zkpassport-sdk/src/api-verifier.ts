import type { NullifierType, ProofResult, Query, QueryResult } from "@zkpassport/utils"
import type { QueryResultErrors } from "./types"

/**
 * Pure-fetch client for the hosted ZKPassport verification API. This module has no
 * heavy dependencies (no bb.js / WASM) so it can run in any browser or server
 * context. The API verifies the proofs statelessly and returns the outcome.
 *
 * PRIVACY: calling this sends the proofs and their public inputs — including the
 * disclosed attributes and the unique identifier — to the verification API. Do not
 * call it unless the integrator opted in.
 *
 * TRUST: a `verified` result received in the browser is a UX signal only. Servers
 * must verify proofs themselves (with this API server-side, or with `verify()`).
 */

export const DEFAULT_VERIFIER_API_URL = "https://verifier.zkpassport.id"

export interface ApiVerifierRequest {
  /** Domain (hostname) of the relying party the request was made for */
  domain: string
  proofs: Array<ProofResult>
  query: Query
  queryResult: QueryResult
  scope?: string
  validity?: number
  devMode?: boolean
  oprfKeyId?: string
}

export interface ApiVerifierResult {
  /**
   * `true`/`false` when the API answered; `undefined` when it could not be reached
   * (network failure, timeout, or server error) — i.e. "not checked", which callers
   * must not treat as a failed verification.
   */
  verified: boolean | undefined
  uniqueIdentifier?: string
  uniqueIdentifierType?: NullifierType
  queryResultErrors?: Partial<QueryResultErrors>
  /** Populated when the API rejected the proofs or could not be reached */
  error?: string
}

export interface ApiVerifierOptions {
  /** Override the verification API base URL (e.g. for self-hosted deployments) */
  apiUrl?: string
  /** Request timeout in milliseconds. Defaults to 15000. */
  timeoutMs?: number
}

/**
 * Verify a set of proofs against the hosted verification API.
 *
 * Resolves with `verified: undefined` (never rejects, never returns `false`) when
 * the API is unreachable, so transient network failures don't render as "failed".
 */
export async function verifyViaApi(
  request: ApiVerifierRequest,
  options?: ApiVerifierOptions,
): Promise<ApiVerifierResult> {
  const baseUrl = (options?.apiUrl ?? DEFAULT_VERIFIER_API_URL).replace(/\/$/, "")
  try {
    const response = await fetch(`${baseUrl}/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(options?.timeoutMs ?? 15000),
    })
    if (response.status >= 500) {
      // The API failed, it did not judge the proofs
      return { verified: undefined, error: `Verification API error: ${response.status}` }
    }
    const body = (await response.json().catch(() => null)) as
      | (Omit<ApiVerifierResult, "verified"> & { verified?: unknown })
      | null
    if (!body || typeof body.verified !== "boolean") {
      // Anything without an explicit boolean verdict (404s, proxy pages, contract
      // mismatches) is "not checked", not "failed"
      return {
        verified: undefined,
        error: `Verification API returned an unexpected response (status ${response.status})`,
      }
    }
    return { ...body, verified: body.verified }
  } catch (e) {
    return {
      verified: undefined,
      error: `Verification API unreachable: ${e instanceof Error ? e.message : String(e)}`,
    }
  }
}
