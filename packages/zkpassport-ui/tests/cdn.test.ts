import { describe, expect, test } from "bun:test"
import { readButtonOptions } from "../src/cdn/options"

class FakeElement extends EventTarget {
  constructor(
    public dataset: Record<string, string>,
    public textContent?: string,
  ) {
    super()
  }
  hasAttribute(name: string) {
    return name === "data-dev-mode" && "devMode" in this.dataset
  }
}

const asElement = (fake: FakeElement) => fake as unknown as HTMLElement

describe("readButtonOptions", () => {
  test("requires data-policy-id", () => {
    const element = new FakeElement({ label: "Verify" })
    expect(readButtonOptions(asElement(element), element)).toBeNull()
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

    expect(readButtonOptions(asElement(element), element)).toMatchObject({
      policyId: "pol_123",
      label: "Get verified",
      theme: "dark",
      size: "large",
      devMode: true,
      popupUrl: "http://localhost:5173",
    })
  })

  test("uses the element's own text as the label", () => {
    const element = new FakeElement({ policyId: "pol_123" }, " Verify your age ")

    expect(readButtonOptions(asElement(element), element)!.label).toBe("Verify your age")
  })

  test("turns every callback into an event on the given target", () => {
    const element = new FakeElement({ policyId: "pol_123" })
    const target = new EventTarget()
    const received: Array<[string, unknown]> = []
    const names = [
      "request-received",
      "generating-proof",
      "proof-generated",
      "success",
      "reject",
      "error",
      "close",
    ]
    for (const name of names) {
      target.addEventListener(`zkpassport:${name}`, (event) =>
        received.push([event.type, (event as CustomEvent).detail]),
      )
    }
    const options = readButtonOptions(asElement(element), target)!

    options.onRequestReceived?.()
    options.onGeneratingProof?.()
    options.onProofGenerated?.({ index: 1, total: 2 })
    options.onSuccess?.({ proofs: [], result: {} } as never)
    options.onReject?.()
    options.onError?.("popup blocked")
    options.onClose?.()

    expect(received).toEqual([
      ["zkpassport:request-received", null],
      ["zkpassport:generating-proof", null],
      ["zkpassport:proof-generated", { index: 1, total: 2 }],
      ["zkpassport:success", { proofs: [], result: {} }],
      ["zkpassport:reject", null],
      ["zkpassport:error", "popup blocked"],
      ["zkpassport:close", null],
    ])
  })
})
