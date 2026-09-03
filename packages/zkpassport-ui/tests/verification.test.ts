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
      onSuccess: () => {},
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

  test("relays success to onSuccess and waits for it before reporting success", async () => {
    const { emitFromPopup } = setupFakeWindow()
    const statuses: string[] = []
    const received: unknown[] = []
    const verification = createVerification(
      () => ({
        name: "Aztec",
        query: (builder) => builder.done(),
        onSuccess: async (response) => {
          received.push(response)
        },
      }),
      (state) => statuses.push(state.status),
    )

    verification.verify()
    emitFromPopup({ zkpassport: true, type: "ready" })
    emitFromPopup({ zkpassport: true, type: "success", proofs: [{ proof: "0x1" }], result: {} })
    expect(statuses).toEqual(["in-progress"])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(received).toEqual([{ proofs: [{ proof: "0x1" }], result: {} }])
    expect(statuses).toEqual(["in-progress", "success"])
  })

  test("shows the error status when onSuccess vetoes by returning false", async () => {
    const { emitFromPopup } = setupFakeWindow()
    const statuses: string[] = []
    const verification = createVerification(
      () => ({
        name: "Aztec",
        query: (builder) => builder.done(),
        onSuccess: async () => false,
      }),
      (state) => statuses.push(state.status),
    )

    verification.verify()
    emitFromPopup({ zkpassport: true, type: "ready" })
    emitFromPopup({ zkpassport: true, type: "success", proofs: [], result: {} })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(statuses).toEqual(["in-progress", "error"])
  })

  test("reports an error status when the user rejects the request", () => {
    const { emitFromPopup } = setupFakeWindow()
    const statuses: string[] = []
    const verification = createVerification(
      () => ({ name: "Aztec", query: (builder) => builder.gte("age", 18).done() }),
      (state) => statuses.push(state.status),
    )

    verification.verify()
    emitFromPopup({ zkpassport: true, type: "rejected" })

    expect(statuses).toEqual(["in-progress", "error"])
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
      onSuccess: () => {
        received.push("click-time")
      },
    }
    const verification = createVerification(
      () => options,
      () => {},
    )

    verification.verify()
    // The consumer re-renders with a new callback while the popup works
    options = {
      ...options,
      onSuccess: () => {
        received.push("event-time")
      },
    }
    emitFromPopup({ zkpassport: true, type: "ready" })
    emitFromPopup({ zkpassport: true, type: "success", proofs: [], result: {} })

    expect(received).toEqual(["event-time"])
  })
})

describe("createVerification with mintToken", () => {
  const mintOptions: VerificationOptions = {
    mintToken: true,
    chain: "ethereum_sepolia",
    policyId: "0x919a000000000000000000000000000000000000000000000000000000002187",
    walletAddress: "0x89D94DA1c6a8564f66e414A8C1C323F96c685006",
    registry: "0x2a615a175439b9eb0004b924aBdD2B4c7a871f11",
    rpcUrl: "http://localhost:8545",
    devMode: true,
  }

  test("sends the attest block and an empty query", () => {
    const { sentToPopup, emitFromPopup } = setupFakeWindow()
    createVerification(
      () => mintOptions,
      () => {},
    ).verify()
    emitFromPopup({ zkpassport: true, type: "ready" })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configure = sentToPopup[0] as any
    expect(configure.request).toEqual({
      devMode: true,
      attest: {
        chain: "ethereum_sepolia",
        policyId: "0x919a000000000000000000000000000000000000000000000000000000002187",
        walletAddress: "0x89D94DA1c6a8564f66e414A8C1C323F96c685006",
        registry: "0x2a615a175439b9eb0004b924aBdD2B4c7a871f11",
        rpcUrl: "http://localhost:8545",
      },
    })
    expect(configure.query).toEqual({})
  })

  test("relays the attest outcome to onSuccess", () => {
    const { emitFromPopup } = setupFakeWindow()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let outcome: any
    createVerification(
      () => ({
        ...mintOptions,
        onSuccess: (response) => {
          outcome = response
        },
      }),
      () => {},
    ).verify()
    emitFromPopup({
      zkpassport: true,
      type: "success",
      proofs: [],
      result: {},
      attest: { status: "minted", txHash: "0xdead", issueCall: { functionName: "issue" } },
    })

    expect(outcome.attest).toEqual({
      status: "minted",
      txHash: "0xdead",
      issueCall: { functionName: "issue" },
    })
  })

  test("rejects a query alongside mintToken", () => {
    setupFakeWindow()
    const errors: string[] = []
    const statuses: string[] = []
    createVerification(
      () => ({
        ...mintOptions,
        query: (builder) => builder.done(),
        onError: (message) => errors.push(message),
      }),
      (state) => statuses.push(state.status),
    ).verify()

    expect(statuses).toEqual(["error"])
    expect(errors).toEqual(["Failed to build the verification query"])
  })

  test("rejects mintToken without the attest fields", () => {
    setupFakeWindow()
    const statuses: string[] = []
    createVerification(
      () => ({ mintToken: true, chain: "ethereum_sepolia" }),
      (state) => statuses.push(state.status),
    ).verify()

    expect(statuses).toEqual(["error"])
  })

  test("still requires a query without mintToken", () => {
    setupFakeWindow()
    const statuses: string[] = []
    createVerification(
      () => ({ name: "Aztec" }),
      (state) => statuses.push(state.status),
    ).verify()

    expect(statuses).toEqual(["error"])
  })
})
