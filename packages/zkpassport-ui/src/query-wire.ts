import { getChainFromId, normalizeCountry } from "@zkpassport/sdk"
import type {
  BoundData as WireBoundData,
  FacematchMode,
  IDCredentialValue,
  Query as WireQuery,
  SupportedChain,
} from "@zkpassport/sdk"

/** A country name or alpha-3 code, as the existing query surface already accepts. */
type Country = IDCredentialValue<"nationality">

/**
 * The public query: one shape per credential, bounds where the circuits commit bounds, sets where
 * they commit sets, and `disclose` as the only thing that reveals a value.
 *
 * Bounds are inclusive and dates are day-granular, matching what the circuits store: "under 65" is
 * `{ max: 64 }`, "born before 2007" is `{ max: new Date("2006-12-31") }`.
 */
export type Query = {
  age?: { min?: number; max?: number }
  birthdate?: { min?: Date; max?: Date; disclose?: true }
  expiry_date?: { min?: Date; max?: Date; disclose?: true }
  nationality?: { included?: Country[]; excluded?: Country[]; disclose?: true }
  issuing_country?: { included?: Country[]; excluded?: Country[]; disclose?: true }
  document_type?: { disclose: true }
  firstname?: { disclose: true }
  lastname?: { disclose: true }
  fullname?: { disclose: true }
  gender?: { disclose: true }
  document_number?: { disclose: true }
  sanctions?: boolean
  facematch?: true | { mode: FacematchMode }
}

/** Per-user data committed into the proof. The wire keeps `user_address` / `custom_data`. */
export type BoundData = {
  account?: `0x${string}`
  chainId?: number
  data?: string
}

const DISCLOSE_ONLY = [
  "document_type",
  "firstname",
  "lastname",
  "fullname",
  "gender",
  "document_number",
] as const

const BOUNDS = ["birthdate", "expiry_date"] as const
const SETS = ["nationality", "issuing_country"] as const

function facematchMode(
  value: true | { mode: FacematchMode } | undefined,
): FacematchMode | undefined {
  if (value === undefined) return undefined
  return value === true ? "strict" : value.mode
}

function bounds(value: { min?: unknown; max?: unknown }): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // The circuits store inclusive bounds, so `min`/`max` are `gte`/`lte` and never `gt`/`lt`
  if (value.min !== undefined) out.gte = value.min
  if (value.max !== undefined) out.lte = value.max
  return out
}

/**
 * Whether the query reveals anything. `document_type` is excluded: it is injected *because*
 * something else is disclosed, so counting it would make the injection self-sustaining.
 */
function disclosesAnything(query: Query): boolean {
  return Object.entries(query).some(
    ([key, value]) =>
      key !== "document_type" &&
      typeof value === "object" &&
      value !== null &&
      "disclose" in value &&
      value.disclose === true,
  )
}

function toWireBind(bind: BoundData): WireBoundData {
  const wire: WireBoundData = {}
  if (bind.account !== undefined) wire.user_address = bind.account
  if (bind.chainId !== undefined) wire.chain = getChainFromId(bind.chainId) as SupportedChain
  if (bind.data !== undefined) wire.custom_data = bind.data
  return wire
}

/**
 * Translate the public query into the shape the mobile app parses.
 *
 * The app reads `gte`/`lte`/`in`/`out`/`disclose` and `bind.user_address`, so the public names are
 * ours alone and everything downstream — the popup protocol, `hydrateQueryBuilder`, the consent
 * screen — keeps working unchanged. Moves into the SDK when request building does; it must move
 * rather than be copied, or the bound conversions end up implemented twice.
 */
export function toWireQuery(query: Query, bind?: BoundData): WireQuery {
  const wire: Record<string, unknown> = {}

  if (query.age) {
    const age = bounds(query.age)
    if (Object.keys(age).length > 0) wire.age = age
  }

  for (const key of BOUNDS) {
    const value = query[key]
    if (!value) continue
    const entry = bounds(value)
    if (value.disclose) entry.disclose = true
    if (Object.keys(entry).length > 0) wire[key] = entry
  }

  for (const key of SETS) {
    const value = query[key]
    if (!value) continue
    const entry: Record<string, unknown> = {}
    if (value.included !== undefined) entry.in = value.included.map(normalizeCountry)
    if (value.excluded !== undefined) entry.out = value.excluded.map(normalizeCountry)
    if (value.disclose) entry.disclose = true
    if (Object.keys(entry).length > 0) wire[key] = entry
  }

  for (const key of DISCLOSE_ONLY) {
    if (query[key]?.disclose) wire[key] = { disclose: true }
  }

  // TD1 and TD3 put fields at different offsets, and the disclosed bytes carry no marker for which
  // layout they came from. The document-type character sits at index 0 in both, so disclosing it
  // whenever anything else is disclosed is what lets the values be decoded unambiguously.
  if (disclosesAnything(query)) wire.document_type = { disclose: true }

  if (query.sanctions) wire.sanctions = { strict: true }

  const facematch = facematchMode(query.facematch)
  if (facematch !== undefined) wire.facematch = { mode: facematch }

  if (bind) {
    const wireBind = toWireBind(bind)
    if (Object.keys(wireBind).length > 0) wire.bind = wireBind
  }

  return wire as WireQuery
}
