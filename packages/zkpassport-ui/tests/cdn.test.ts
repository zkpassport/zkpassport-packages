import { describe, expect, test } from "bun:test"
import { readButtonOptions } from "../src/cdn/options"

class FakeElement extends EventTarget {
  dataset: Record<string, string>
  constructor(dataset: Record<string, string>) {
    super()
    this.dataset = dataset
  }
  hasAttribute(name: string) {
    return name === "data-dev-mode" && "devMode" in this.dataset
  }
}

const asElement = (fake: FakeElement) => fake as unknown as HTMLElement

describe("readButtonOptions", () => {
  test("requires data-policy-id", () => {
    expect(readButtonOptions(asElement(new FakeElement({ label: "Verify" })))).toBeNull()
  })

  test("maps data attributes to button options", () => {
    const element = new FakeElement({
      policyId: "pol_123",
      label: "Get verified",
      theme: "dark",
      size: "large",
      devMode: "",
      popupUrl: "http://localhost:5173",
    })

    const options = readButtonOptions(asElement(element))!

    expect(options).toMatchObject({
      policyId: "pol_123",
      label: "Get verified",
      theme: "dark",
      size: "large",
      devMode: true,
      popupUrl: "http://localhost:5173",
    })
  })

  test("reports the outcome as events on the element", () => {
    const element = new FakeElement({ policyId: "pol_123" })
    const received: CustomEvent[] = []
    for (const name of ["success", "rejected", "error", "closed"]) {
      element.addEventListener(`zkpassport:${name}`, (event) => received.push(event as CustomEvent))
    }
    const options = readButtonOptions(asElement(element))!

    options.onSuccess?.({ proofs: [], result: {} } as never)
    options.onReject?.()
    options.onError?.("popup blocked")
    options.onClose?.()

    expect(received.map((event) => [event.type, event.detail])).toEqual([
      ["zkpassport:success", { proofs: [], result: {} }],
      ["zkpassport:rejected", null],
      ["zkpassport:error", "popup blocked"],
      ["zkpassport:closed", null],
    ])
  })

  test("preventDefault on the success event vetoes the success state", () => {
    const element = new FakeElement({ policyId: "pol_123" })
    const options = readButtonOptions(asElement(element))!

    expect(options.onSuccess?.({} as never)).toBe(true)
    element.addEventListener("zkpassport:success", (event) => event.preventDefault())
    expect(options.onSuccess?.({} as never)).toBe(false)
  })
})
