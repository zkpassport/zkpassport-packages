/**
 * TS twin of `zkpassport.nr`'s `zkpassport_core/src/disclosed_data.nr` — keep
 * the two in lockstep (the goldens in test/disclosed-data.test.ts match the
 * Noir unit tests literal-for-literal).
 *
 * The app-side helpers here are CONVENIENCE: they predict what the in-circuit
 * `disclosed_nationality` will accept so the claim value can be built (and bad
 * queries fail client-side with a readable error). The soundness-critical twin
 * runs in the circuit; see its doc for why the layout branches on the signed
 * document code — which is also why nationality queries must disclose
 * `document_type` alongside `nationality`.
 */

/** ICAO 9303 nationality offset in a TD3 passport MRZ (2 x 44, zero-padded to 90). */
export const TD3_NATIONALITY_INDEX = 54
/** ICAO 9303 nationality offset in a TD1 ID-card MRZ (3 x 30 = 90). */
export const TD1_NATIONALITY_INDEX = 45

/** ICAO document codes: passports start with 'P'; TD1 ID cards with 'I'/'A'/'C'. */
export function isIdCard(disclosedBytes: number[]): boolean {
  return disclosedBytes[0] !== 0x50 /* 'P' */
}

/**
 * The disclosed alpha-3 nationality bytes, layout-aware. RAW, deliberately not
 * normalized: German documents disclose "D<<", and normalizing to "DEU" (as
 * `DisclosedData` does) would desync any packed claim value from the in-circuit
 * pack.
 */
export function nationalityBytes(disclosedBytes: number[]): number[] {
  const index = isIdCard(disclosedBytes) ? TD1_NATIONALITY_INDEX : TD3_NATIONALITY_INDEX
  return disclosedBytes.slice(index, index + 3)
}

/**
 * Big-endian pack of the 3 raw nationality bytes — equals `DisclosedNationality.packed`
 * in the Noir twin and `@zkpassport/utils`' getCountryWeightedSum encoding.
 */
export function packNationality(disclosedBytes: number[]): bigint {
  const [a, b, c] = nationalityBytes(disclosedBytes)
  return BigInt(a) * 65536n + BigInt(b) * 256n + BigInt(c)
}
