import { describe, expect, test } from "bun:test"

import { toWireQuery, type Query } from "../src/query-wire"

describe("toWireQuery", () => {
  test("age bounds become inclusive comparisons", () => {
    expect(toWireQuery({ age: { min: 18 } })).toEqual({ age: { gte: 18 } })
    expect(toWireQuery({ age: { min: 18, max: 64 } })).toEqual({ age: { gte: 18, lte: 64 } })
    expect(toWireQuery({ age: { max: 64 } })).toEqual({ age: { lte: 64 } })
  })

  test("an equality is a bound on both sides", () => {
    expect(toWireQuery({ age: { min: 30, max: 30 } })).toEqual({ age: { gte: 30, lte: 30 } })
  })

  test("dates keep their objects", () => {
    const min = new Date("1960-01-01")
    const max = new Date("2006-12-31")
    expect(toWireQuery({ birthdate: { min, max } })).toEqual({ birthdate: { gte: min, lte: max } })
  })

  test("country sets become in and out", () => {
    expect(toWireQuery({ nationality: { included: ["FRA"], excluded: ["PRK"] } })).toEqual({
      nationality: { in: ["FRA"], out: ["PRK"] },
    })
  })

  // The circuits compare alpha-3, and the popup seeds its builder with .raw(),
  // which skips the normalisation .in()/.out() would have done
  test("country names become alpha-3 codes", () => {
    expect(
      toWireQuery({
        nationality: { included: ["Austria", "Czech Republic"] },
        issuing_country: { excluded: ["North Korea"] },
      }),
    ).toEqual({
      nationality: { in: ["AUT", "CZE"] },
      issuing_country: { out: ["PRK"] },
    })
  })

  test("names and codes mix in one set", () => {
    expect(toWireQuery({ nationality: { included: ["Austria", "DEU"] } })).toEqual({
      nationality: { in: ["AUT", "DEU"] },
    })
  })

  test("disclosure carries through alongside a constraint", () => {
    expect(toWireQuery({ nationality: { included: ["FRA"], disclose: true } })).toEqual({
      nationality: { in: ["FRA"], disclose: true },
      document_type: { disclose: true },
    })
  })

  test("disclosing anything also discloses the document type", () => {
    expect(toWireQuery({ firstname: { disclose: true } })).toEqual({
      firstname: { disclose: true },
      document_type: { disclose: true },
    })
  })

  test("disclosing only the document type does not sustain the injection", () => {
    expect(toWireQuery({ document_type: { disclose: true } })).toEqual({
      document_type: { disclose: true },
    })
  })

  test("a query that proves without revealing discloses nothing", () => {
    expect(toWireQuery({ age: { min: 18 }, nationality: { excluded: ["PRK"] } })).toEqual({
      age: { gte: 18 },
      nationality: { out: ["PRK"] },
    })
  })

  test("sanctions and facematch modes", () => {
    expect(toWireQuery({ sanctions: true, facematch: true })).toEqual({
      sanctions: { strict: true },
      facematch: { mode: "strict" },
    })
    expect(toWireQuery({ facematch: { mode: "regular" } })).toEqual({
      facematch: { mode: "regular" },
    })
    expect(toWireQuery({ sanctions: false })).toEqual({})
  })

  test("bind maps to the wire keys the app reads", () => {
    expect(toWireQuery({}, { account: "0xabc", chainId: 8453, data: "nonce" })).toEqual({
      bind: { user_address: "0xabc", chain: "base", custom_data: "nonce" },
    })
  })

  test("an unsupported chain id is rejected rather than sent", () => {
    expect(() => toWireQuery({}, { chainId: 999_999 })).toThrow()
  })

  test("empty inputs produce an empty query", () => {
    expect(toWireQuery({})).toEqual({})
    expect(toWireQuery({}, {})).toEqual({})
    expect(toWireQuery({ age: {} })).toEqual({})
  })

  test("the full query", () => {
    const query: Query = {
      age: { min: 18, max: 64 },
      birthdate: { min: new Date("1960-01-01"), disclose: true },
      expiry_date: { min: new Date("2027-01-01") },
      nationality: { included: ["FRA", "DEU"] },
      issuing_country: { excluded: ["PRK"] },
      firstname: { disclose: true },
      lastname: { disclose: true },
      fullname: { disclose: true },
      gender: { disclose: true },
      document_number: { disclose: true },
      sanctions: true,
      facematch: { mode: "strict" },
    }
    expect(toWireQuery(query, { account: "0xabc", chainId: 1 })).toEqual({
      age: { gte: 18, lte: 64 },
      birthdate: { gte: new Date("1960-01-01"), disclose: true },
      expiry_date: { gte: new Date("2027-01-01") },
      nationality: { in: ["FRA", "DEU"] },
      issuing_country: { out: ["PRK"] },
      firstname: { disclose: true },
      lastname: { disclose: true },
      fullname: { disclose: true },
      gender: { disclose: true },
      document_number: { disclose: true },
      document_type: { disclose: true },
      sanctions: { strict: true },
      facematch: { mode: "strict" },
      bind: { user_address: "0xabc", chain: "ethereum" },
    })
  })
})
