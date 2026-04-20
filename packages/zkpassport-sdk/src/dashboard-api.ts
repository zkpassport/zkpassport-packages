import type { ProofResult, QueryResult } from "@zkpassport/utils"
import { DASHBOARD_API_BASE_URL, VERSION } from "./constants"
import { noLogger as logger } from "./logger"

export async function submitProof({
  projectId,
  domain,
  proofs,
  queryResult,
  uniqueIdentifier,
  scope,
}: {
  projectId: string
  domain: string
  proofs: Array<ProofResult>
  queryResult: QueryResult
  uniqueIdentifier: string | undefined
  scope: string | undefined
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
    const response = await fetch(`${DASHBOARD_API_BASE_URL}/proofs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        domain,
        proofs: payload,
        queryResult,
        uniqueIdentifier,
        scope,
        sdkVersion: VERSION,
      }),
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
