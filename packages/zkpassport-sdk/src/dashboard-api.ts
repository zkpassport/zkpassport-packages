import type { ProofResult, Query, QueryResult } from "@zkpassport/utils"
import { DASHBOARD_API_BASE_URL, VERSION } from "./constants"
import { noLogger as logger } from "./logger"

/** Fire-and-forget: errors are logged, never thrown. */
export async function submitProof({
  domain,
  proofs,
  query,
  queryResult,
  scope,
  requestId,
}: {
  domain: string
  proofs: Array<ProofResult>
  query: Query
  queryResult: QueryResult
  scope: string | undefined
  requestId: string | undefined
}) {
  const payload = proofs.map((p) => ({
    proof: p.proof,
    vkeyHash: p.vkeyHash,
    version: p.version,
    name: p.name,
    index: p.index,
    total: p.total,
    committedInputs: p.committedInputs,
  }))
  try {
    const response = await fetch(`${DASHBOARD_API_BASE_URL}/public/proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain,
        proofs: payload,
        query,
        queryResult,
        scope,
        sdkVersion: VERSION,
        requestId,
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      logger.warn("API request failed with status:", response.status)
    } else {
      logger.debug("API response status:", response.status)
    }
  } catch (e) {
    logger.warn("API call failed:", e)
  }
}
