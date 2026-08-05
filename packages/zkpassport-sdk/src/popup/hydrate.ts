import type { Query } from "@zkpassport/utils"
import type { QueryBuilder, QueryBuilderResult } from "../types"

// Seed a fresh builder from the serialized Query the RP page sent over
// postMessage. The Query object is the canonical wire format (the QR path
// carries the same object in the URL), so it is injected verbatim — nothing
// to replay, nothing to go out of sync when the builder gains methods.
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
