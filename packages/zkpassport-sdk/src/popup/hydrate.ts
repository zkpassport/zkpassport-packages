import type { Query } from "@zkpassport/utils"
import type { QueryBuilder, QueryBuilderResult } from "../types"

/**
 * Rebuild a request on a fresh QueryBuilder from a raw (serialized) Query object.
 * Used by the hosted verification popup: the RP page serializes its final query
 * (functions can't cross postMessage) and the popup seeds its own builder with
 * it verbatim. The Query object is the canonical wire format (the QR/deep-link
 * path carries the same object in the URL), so there is nothing to replay and
 * nothing that can go out of sync when the builder gains new methods.
 */
export function hydrateQueryBuilder(
  builder: QueryBuilder,
  query: Query,
  policyId?: string,
): QueryBuilderResult {
  if (policyId) {
    return builder.policy(policyId).done()
  }
  return builder.raw(query).done()
}
