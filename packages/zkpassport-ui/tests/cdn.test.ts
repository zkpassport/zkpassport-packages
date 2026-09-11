import { describe, expect, test } from "bun:test"
import { readButtonOptions } from "../src/cdn/options"

class FakeElement extends EventTarget {
  tagName = "DIV"
  href?: string
  textContent?: string
  constructor(
    public dataset: Record<string, string>,
    link?: { href: string; text: string },
  ) {
    super()
    if (link) {
      this.tagName = "A"
      this.href = link.href
      this.textContent = link.text
    }
  }
  hasAttribute(name: string) {
    return name === "data-dev-mode" && "devMode" in this.dataset
  }
}

const asElement = (fake: FakeElement) => fake as unknown as HTMLElement

describe("readButtonOptions", () => {
  test("requires a policy", () => {
    expect(readButtonOptions(asElement(new FakeElement({ label: "Verify" })))).toBeNull()
    const linkWithoutPolicy = new FakeElement(
      {},
      { href: "https://verify.zkpassport.id/", text: "Verify" },
    )
    expect(readButtonOptions(asElement(linkWithoutPolicy))).toBeNull()
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

  test("reads a link's policy from its URL and its text as the label", () => {
    const link = new FakeElement(
      {},
      { href: "https://verify.zkpassport.id/?policy=pol_123", text: " Verify your age " },
    )

    const options = readButtonOptions(asElement(link))!

    expect(options).toMatchObject({
      policyId: "pol_123",
      label: "Verify your age",
      popupUrl: "https://verify.zkpassport.id/?policy=pol_123",
    })
  })

  test("reports the outcome as events on the given target", () => {
    const element = new FakeElement({ policyId: "pol_123" })
    const target = new EventTarget()
    const received: CustomEvent[] = []
    for (const name of ["success", "rejected", "error", "closed"]) {
      target.addEventListener(`zkpassport:${name}`, (event) => received.push(event as CustomEvent))
    }
    const options = readButtonOptions(asElement(element), target)!

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
