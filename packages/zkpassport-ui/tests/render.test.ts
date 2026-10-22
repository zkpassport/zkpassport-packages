import { afterEach, describe, expect, test } from "bun:test"
import { resolveTarget } from "../src/render-target"

class FakeElement {}
const realDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
const realHTMLElement = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement")

function setupDocument(elements: Record<string, unknown>) {
  Object.defineProperty(globalThis, "HTMLElement", { value: FakeElement, configurable: true })
  Object.defineProperty(globalThis, "document", {
    value: { querySelector: (selector: string) => elements[selector] ?? null },
    configurable: true,
  })
}

afterEach(() => {
  for (const [key, descriptor] of [
    ["document", realDocument],
    ["HTMLElement", realHTMLElement],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete (globalThis as Record<string, unknown>)[key]
  }
})

describe("resolveTarget", () => {
  test("returns an element as is", () => {
    setupDocument({})
    const element = new FakeElement() as HTMLElement
    expect(resolveTarget(element)).toBe(element)
  })

  test("resolves a selector to its element", () => {
    const element = new FakeElement() as HTMLElement
    setupDocument({ "#verify": element })
    expect(resolveTarget("#verify")).toBe(element)
  })

  test("throws when the selector matches nothing", () => {
    setupDocument({})
    expect(() => resolveTarget("#missing")).toThrow('no element matches "#missing"')
  })
})
