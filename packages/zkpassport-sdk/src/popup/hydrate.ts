import type { Query } from "@zkpassport/utils"
import type { QueryBuilder, QueryBuilderResult } from "../types"

// Seed a fresh builder from the serialized Query the RP page sent over
// postMessage. The Query object is the canonical wire format — a `policy`
// reference in it is dereferenced by raw() against the popup's own dashboard
// config (attested origin), and literal conditions are injected verbatim.
export function hydrateQueryBuilder(builder: QueryBuilder, query: Query): QueryBuilderResult {
  return builder.raw(query).done()
}
