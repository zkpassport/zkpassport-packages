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

// Same Query output as request()'s builder, with no bridge/network/class deps
export function createOfflineQuery(): QueryBuilder<"offline"> {
  const config: Record<string, Query> = { query: {} }
  const topic = "query"
  let hasConditions = false

  const assertNotPolicyLocked = (method: string) => {
    if (config[topic].policy) {
      throw new Error(
        `Cannot call .${method}() on a policy-driven query. The query for policy '${config[topic].policy}' is immutable.`,
      )
    }
    hasConditions = true
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
      // Runtime payload: composes with policies (it only adds committed data)
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
      if (config[topic].policy) {
        throw new Error(
          `Cannot call .policy() more than once on a request (already set to '${config[topic].policy}').`,
        )
      }
      if (hasConditions) {
        throw new Error(
          "Cannot combine .policy() with builder methods like .gte()/.disclose()/etc.",
        )
      }
      config[topic].policy = id
      return builder
    },
    done: (() => {
      return { query: config[topic] } satisfies OfflineQueryBuilderResult
    }) as QueryBuilder<"offline">["done"],
  }
  return builder
}
