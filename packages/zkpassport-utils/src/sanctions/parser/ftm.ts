import { FtmEntity } from "../types"

/**
 * Parse an OpenSanctions FollowTheMoney export. The bulk `entities.ftm.json` files are
 * newline-delimited JSON (one entity per line); a JSON array of entities, or an object with an
 * `entities` array, is accepted too. Lines that are not valid JSON objects are skipped.
 */
export function parseFtmEntities(text: string): FtmEntity[] {
  const trimmed = text.trim()
  if (trimmed === "") return []
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    // A single JSON document, unless it is the first line of an NDJSON stream
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.filter(isEntityLike)
      if (typeof parsed === "object" && parsed !== null) {
        const wrapped = (parsed as { entities?: unknown }).entities
        if (Array.isArray(wrapped)) return wrapped.filter(isEntityLike)
        if (isEntityLike(parsed)) return [parsed]
      }
      return []
    } catch {
      // fall through to NDJSON
    }
  }
  const entities: FtmEntity[] = []
  for (const line of trimmed.split("\n")) {
    const l = line.trim()
    if (!l) continue
    try {
      const parsed = JSON.parse(l)
      if (isEntityLike(parsed)) entities.push(parsed)
    } catch {
      // not JSON: skip the line, as the source parser did
    }
  }
  return entities
}

function isEntityLike(value: unknown): value is FtmEntity {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FtmEntity).id === "string" &&
    typeof (value as FtmEntity).schema === "string" &&
    typeof (value as FtmEntity).properties === "object" &&
    (value as FtmEntity).properties !== null
  )
}

/** Values of a multi-valued FTM property, always an array of strings */
export function prop(entity: FtmEntity, name: string): string[] {
  const values = entity.properties[name]
  return Array.isArray(values) ? values.filter((v) => typeof v === "string") : []
}
