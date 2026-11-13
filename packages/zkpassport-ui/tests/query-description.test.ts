import { describe, expect, test } from "bun:test"
import type { Query } from "@zkpassport/sdk"

import { describeQuery } from "../src/query-description"

describe("describeQuery", () => {
  test("a request for a driving licence reads as one", () => {
    const query: Query = { document_type: { eq: "driving_license" } }
    const titles = describeQuery(query).map((item) => item.title)
    expect(titles).toContain("Your ID is a driving license")
  })
})
