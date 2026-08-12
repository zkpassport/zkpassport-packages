import { afterEach, describe, expect, test } from "bun:test"
import { createVerification, type VerificationOptions } from "../src/verification"
import type { VerifyWithZKPassportButtonOptions } from "../src/verify-button"

const POPUP_ORIGIN = "https://verify.zkpassport.id"

type Listener = (event: MessageEvent) => void

type FakePopup = {
  closed: boolean
  focus: () => void
  close: () => void
  postMessage: (data: unknown) => void
}

function setupFakeWindow() {
  const listeners = new Set<Listener>()
  const sentToPopup: unknown[] = []
  const popups: FakePopup[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window = {
    open: () => {
      const popup: FakePopup = {
        closed: false,
        focus() {},
        close() {
          popup.closed = true
        },
        postMessage: (data: unknown) => {
          sentToPopup.push(data)
        },
      }
      popups.push(popup)
      return popup
    },
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }
  // Events arrive from the most recently opened popup
  const emitFromPopup = (data: unknown) => {
    for (const listener of [...listeners]) {
      listener({ origin: POPUP_ORIGIN, data, source: popups[popups.length - 1] } as MessageEvent)
    }
  }
  return { sentToPopup, emitFromPopup, popups }
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window
})

describe("createVerification", () => {
  test("sends only the request fields the popup needs", () => {
    const { sentToPopup, emitFromPopup } = setupFakeWindow()
    const options: VerifyWithZKPassportButtonOptions = {
      name: "Aztec",
      scope: "age-check",
      devMode: true,
      policyId: "pol_123",
      label: "Get verified",
      classes: { button: "my-button" },
      onResult: () => {},
      query: (builder) => builder.done(),
    }

    createVerification(
      () => options,
      () => {},
    ).verify()
    emitFromPopup({ zkpassport: true, type: "ready" })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configure = sentToPopup[0] as any
    expect(configure.request).toEqual({ name: "Aztec", scope: "age-check", devMode: true })
    expect(configure.query).toEqual({ policy: "pol_123" })
  })

  test("tracks the popup outcome", () => {
    const { emitFromPopup } = setupFakeWindow()
    const statuses: string[] = []
    const verification = createVerification(
      () => ({ name: "Aztec", query: (builder) => builder.gte("age", 18).done() }),
      (state) => statuses.push(state.status),
    )

    verification.verify()
    emitFromPopup({
      zkpassport: true,
      type: "result",
      proofs: [],
      result: {},
      uniqueIdentifier: "0x1",
      verified: true,
    })

    expect(statuses).toEqual(["in-progress", "success"])
  })

  test("disposes a stale popup handle before reopening", async () => {
    const { popups } = setupFakeWindow()
    const statuses: string[] = []
    const verification = createVerification(
      () => ({ name: "Aztec", query: (builder) => builder.done() }),
      (state) => statuses.push(state.status),
    )

    verification.verify()
    popups[0].closed = true // the user closes the popup...
    verification.verify() // ...and re-clicks before the 500ms close-poll ticks

    // Give the stale poll time to fire; it must not reset the new verification
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(popups).toHaveLength(2)
    expect(statuses).toEqual(["in-progress", "in-progress"])
    verification.close()
  })

  test("reads callbacks at event time, not click time", () => {
    const { emitFromPopup } = setupFakeWindow()
    const received: string[] = []
    let options: VerificationOptions = {
      name: "Aztec",
      query: (builder) => builder.done(),
      onResult: () => received.push("click-time"),
    }
    const verification = createVerification(
      () => options,
      () => {},
    )

    verification.verify()
    // The consumer re-renders with a new callback while the popup works
    options = { ...options, onResult: () => received.push("event-time") }
    emitFromPopup({ zkpassport: true, type: "ready" })
    emitFromPopup({
      zkpassport: true,
      type: "result",
      proofs: [],
      result: {},
      uniqueIdentifier: "0x1",
      verified: true,
    })

    expect(received).toEqual(["event-time"])
  })
})
