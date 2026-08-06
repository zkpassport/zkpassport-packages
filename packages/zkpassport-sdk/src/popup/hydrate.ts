import type { Query } from "@zkpassport/utils"
import type { QueryBuilder, QueryBuilderResult } from "../types"

// Seed a fresh builder from the serialized Query the RP page sent over postMessage.
export function hydrateQueryBuilder(builder: QueryBuilder, query: Query): QueryBuilderResult {
  return builder.raw(query).done()
}
