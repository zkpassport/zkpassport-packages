// OpenSanctions bulk export format: newline-delimited FollowTheMoney entities.
import { describe, expect, test } from "bun:test"
import { parseFtmEntities, prop } from "./ftm"

const a = { id: "a", schema: "Person", properties: { name: ["A"] } }
const b = { id: "b", schema: "Organization", properties: { name: ["B"] }, datasets: ["x"] }

describe("parseFtmEntities", () => {
  test("reads one entity per line", () => {
    const text = `${JSON.stringify(a)}\n${JSON.stringify(b)}\n`
    expect(parseFtmEntities(text)).toEqual([a, b])
  })

  test("also accepts a JSON array or an object wrapping an entities array", () => {
    expect(parseFtmEntities(JSON.stringify([a, b]))).toEqual([a, b])
    expect(parseFtmEntities(JSON.stringify({ entities: [a, b] }))).toEqual([a, b])
    expect(parseFtmEntities(JSON.stringify(a))).toEqual([a])
  })

  test("skips blank lines, malformed lines and non-entity values", () => {
    const text = `${JSON.stringify(a)}\n\nnot json\n42\n{"id":"x"}\n${JSON.stringify(b)}`
    expect(parseFtmEntities(text)).toEqual([a, b])
    expect(parseFtmEntities("")).toEqual([])
    expect(parseFtmEntities("   \n  ")).toEqual([])
  })
})

describe("prop", () => {
  test("returns the values of a multi-valued property, or an empty list", () => {
    expect(prop(a, "name")).toEqual(["A"])
    expect(prop(a, "alias")).toEqual([])
    expect(prop({ ...a, properties: { name: [1, "x"] as unknown as string[] } }, "name")).toEqual([
      "x",
    ])
  })
})
