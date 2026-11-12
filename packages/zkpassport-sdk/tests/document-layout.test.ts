import { describe, expect, test } from "bun:test"
import { getDisclosedLayout, needsDocumentType, withDocumentType } from "../src/document-layout"

describe("document layout", () => {
  test("fields read at layout-dependent offsets need the document type", () => {
    expect(needsDocumentType({ firstname: { disclose: true } })).toBe(true)
    expect(needsDocumentType({ nationality: { eq: "FRA" } })).toBe(true)
    expect(needsDocumentType({ birthdate: { disclose: true } })).toBe(true)
  })

  test("fields that do not depend on the layout do not", () => {
    expect(needsDocumentType({ issuing_country: { disclose: true } })).toBe(false)
    expect(needsDocumentType({ age: { gte: 18 } })).toBe(false)
    expect(needsDocumentType({ nationality: { in: ["FRA"] } })).toBe(false)
    expect(needsDocumentType({ birthdate: { gte: new Date("1990-01-01") } })).toBe(false)
    expect(needsDocumentType({ document_type: { disclose: true } })).toBe(false)
  })

  test("withDocumentType adds the disclosure without touching the input", () => {
    const query = { firstname: { disclose: true as const } }
    expect(withDocumentType(query)).toEqual({
      firstname: { disclose: true },
      document_type: { disclose: true },
    })
    expect(query).toEqual({ firstname: { disclose: true } })
  })

  test("an eq on the document type already discloses it", () => {
    const query = { firstname: { disclose: true as const }, document_type: { eq: "passport" } }
    expect(withDocumentType(query)).toBe(query)
    const plain = { age: { gte: 18 } }
    expect(withDocumentType(plain)).toBe(plain)
  })

  test("the layout comes from the first disclosed character", () => {
    const bytes = (c: string) => [c.charCodeAt(0), ...Array(89).fill(0)]
    expect(getDisclosedLayout(bytes("P"))).toBe("passport")
    expect(getDisclosedLayout(bytes("I"))).toBe("id_card")
    expect(getDisclosedLayout(bytes("D"))).toBe("id_card")
    expect(getDisclosedLayout(Array(90).fill(0))).toBeUndefined()
  })
})
