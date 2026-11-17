import { describe, expect, test } from "bun:test"
import type { Query } from "@zkpassport/sdk"

import { describeQuery } from "../src/query-description"

describe("describeQuery", () => {
  test("a request for a driving licence reads as one", () => {
    const query: Query = { document_type: { eq: "driving_license" } }
    const titles = describeQuery(query).map((item) => item.title)
    expect(titles).toContain("Your ID is a driving license")
  })

  test("a short exclusion list reads as one sentence", () => {
    const query = { nationality: { out: ["IRN", "PRK", "SYR"] } } as unknown as Query
    const titles = describeQuery(query).map((item) => item.title)
    expect(titles).toContain("Your nationality is not IRN, PRK or SYR")
  })

  test("a disclosed field carries its label for the screen to word", () => {
    const query = { nationality: { disclose: true } } as unknown as Query
    expect(describeQuery(query)).toEqual([
      { title: "Share your nationality", disclosed: "nationality" },
    ])
  })
})
