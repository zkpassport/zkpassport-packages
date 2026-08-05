import type {
  BoundData,
  CountryName,
  DisclosableIDCredential,
  FacematchMode,
  IDCredential,
  IDCredentialValue,
  NumericalIDCredential,
  Query,
  SanctionsCountries,
  SanctionsLists,
  SupportedChain,
} from "@zkpassport/utils"
import type { OfflineQueryBuilderResult, QueryBuilder } from "./types"
import { generalCompare, normalizeCountry, numericalCompare, rangeCompare } from "./query-helpers"

/**
 * Standalone offline query builder: builds the same `Query` object as the
 * builder returned by `ZKPassport.request()`, but with no bridge, no network,
 * and no dependency on the ZKPassport class — so bundles that only serialize a
 * query (e.g. the "Verify with ZKPassport" button, which hands the query to the
 * hosted popup) stay small.
 *
 * `.policy(id)` records the policy id without fetching the dashboard config;
 * `done()` returns it alongside the (empty) query so the consumer can forward
 * it to whatever rebuilds the query (the hosted popup applies the policy
 * there, where the relying party's config is available).
 */
export function createOfflineQuery(): QueryBuilder<"offline"> {
  const config: Record<string, Query> = { query: {} }
  const topic = "query"
  let policyId: string | undefined
  let hasBuilderCalls = false

  const assertNotPolicyLocked = (method: string) => {
    if (policyId) {
      throw new Error(
        `Cannot call .${method}() on a policy-driven query. The query for policy '${policyId}' is immutable.`,
      )
    }
    hasBuilderCalls = true
  }

  const builder: QueryBuilder<"offline"> = {
    eq: <T extends IDCredential>(key: T, value: IDCredentialValue<T>) => {
      assertNotPolicyLocked("eq")
      if (key === "issuing_country" || key === "nationality") {
        value = normalizeCountry(value as CountryName) as IDCredentialValue<T>
      }
      generalCompare("eq", key, value, topic, config)
      return builder as unknown as QueryBuilder
    },
    gte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
      assertNotPolicyLocked("gte")
      numericalCompare("gte", key, value, topic, config)
      if (key === "age" && ((value as number) < 1 || (value as number) >= 100)) {
        throw new Error("Age must be between 1 and 99 (inclusive)")
      }
      return builder as unknown as QueryBuilder
    },
    gt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
      assertNotPolicyLocked("gt")
      numericalCompare("gt", key, value, topic, config)
      return builder as unknown as QueryBuilder
    },
    lte: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
      assertNotPolicyLocked("lte")
      numericalCompare("lte", key, value, topic, config)
      return builder as unknown as QueryBuilder
    },
    lt: <T extends NumericalIDCredential>(key: T, value: IDCredentialValue<T>) => {
      assertNotPolicyLocked("lt")
      numericalCompare("lt", key, value, topic, config)
      return builder as unknown as QueryBuilder
    },
    range: <T extends NumericalIDCredential>(
      key: T,
      start: IDCredentialValue<T>,
      end: IDCredentialValue<T>,
    ) => {
      assertNotPolicyLocked("range")
      rangeCompare(key, [start, end], topic, config)
      return builder as unknown as QueryBuilder
    },
    in: <T extends "nationality" | "issuing_country">(key: T, value: IDCredentialValue<T>[]) => {
      assertNotPolicyLocked("in")
      value = value.map((v) => normalizeCountry(v as CountryName)) as IDCredentialValue<T>[]
      generalCompare("in", key, value, topic, config)
      return builder as unknown as QueryBuilder
    },
    out: <T extends "nationality" | "issuing_country">(key: T, value: IDCredentialValue<T>[]) => {
      assertNotPolicyLocked("out")
      value = value.map((v) => normalizeCountry(v as CountryName)) as IDCredentialValue<T>[]
      generalCompare("out", key, value, topic, config)
      return builder as unknown as QueryBuilder
    },
    disclose: (key: DisclosableIDCredential) => {
      assertNotPolicyLocked("disclose")
      config[topic][key] = {
        ...config[topic][key],
        disclose: true,
      }
      return builder as unknown as QueryBuilder
    },
    bind: <T extends keyof BoundData>(
      key: T,
      value: T extends "chain"
        ? SupportedChain
        : T extends "user_address"
          ? `0x${string}`
          : string | undefined,
    ) => {
      assertNotPolicyLocked("bind")
      config[topic].bind = {
        ...config[topic].bind,
        [key]: value,
      }
      return builder as unknown as QueryBuilder
    },
    sanctions: (
      countries: SanctionsCountries = "all",
      lists: SanctionsLists = "all",
      options: { strict?: boolean } = { strict: false },
    ) => {
      assertNotPolicyLocked("sanctions")
      config[topic].sanctions = {
        ...config[topic].sanctions,
        countries,
        lists,
        strict: options.strict ?? false,
      }
      return builder as unknown as QueryBuilder
    },
    facematch: (mode: FacematchMode = "regular") => {
      assertNotPolicyLocked("facematch")
      config[topic].facematch = { mode }
      return builder as unknown as QueryBuilder
    },
    raw: (query: Query) => {
      assertNotPolicyLocked("raw")
      config[topic] = query
      return builder
    },
    policy: (id: string) => {
      if (typeof id !== "string" || id.length === 0) {
        throw new Error(".policy() requires a non-empty string id.")
      }
      if (policyId) {
        throw new Error(
          `Cannot call .policy() more than once on a request (already set to '${policyId}').`,
        )
      }
      if (hasBuilderCalls) {
        throw new Error(
          "Cannot combine .policy() with builder methods like .gte()/.disclose()/etc.",
        )
      }
      policyId = id
      return builder
    },
    done: (() => {
      const result: OfflineQueryBuilderResult = { query: config[topic] }
      if (policyId) result.policy = policyId
      return result
    }) as QueryBuilder<"offline">["done"],
  }
  return builder
}
