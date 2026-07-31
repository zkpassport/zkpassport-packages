/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Query } from "@zkpassport/utils"
import type { QueryBuilder, QueryBuilderResult } from "../types"

/**
 * Rebuild a query on a fresh QueryBuilder from a raw (serialized) Query object.
 * Used by the hosted verification popup: the RP page serializes its final query
 * (functions can't cross postMessage) and the popup replays it on its own builder.
 *
 * Replaying builder methods is idempotent: values were normalized when the RP
 * built the query the first time (e.g. country names to alpha-3), and the
 * builder's normalization leaves already-normalized values unchanged.
 */
export function hydrateQueryBuilder(
  builder: QueryBuilder,
  query: Query,
  policyId?: string,
): QueryBuilderResult {
  if (policyId) {
    return builder.policy(policyId).done()
  }
  let current = builder
  for (const [field, conditions] of Object.entries(query)) {
    if (conditions == null) continue
    if (field === "bind") {
      for (const [key, value] of Object.entries(conditions)) {
        if (value === undefined || value === null) continue
        current = current.bind(key as any, value as any)
      }
      continue
    }
    if (field === "sanctions") {
      const sanctions = conditions as any
      current = current.sanctions(sanctions.countries ?? "all", sanctions.lists ?? "all", {
        strict: sanctions.strict ?? false,
      })
      continue
    }
    if (field === "facematch") {
      current = current.facematch((conditions as any).mode ?? "regular")
      continue
    }
    for (const [op, value] of Object.entries(conditions)) {
      if (value === undefined || value === null) continue
      switch (op) {
        case "disclose":
          if (value) current = current.disclose(field as any)
          break
        case "eq":
          current = current.eq(field as any, value as any)
          break
        case "gte":
          current = current.gte(field as any, value as any)
          break
        case "gt":
          current = current.gt(field as any, value as any)
          break
        case "lte":
          current = current.lte(field as any, value as any)
          break
        case "lt":
          current = current.lt(field as any, value as any)
          break
        case "range":
          current = current.range(field as any, (value as any)[0], (value as any)[1])
          break
        case "in":
          current = current.in(field as any, value as any)
          break
        case "out":
          current = current.out(field as any, value as any)
          break
      }
    }
  }
  return current.done()
}
