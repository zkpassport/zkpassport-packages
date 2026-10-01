import { afterEach, describe, expect, test } from "bun:test"
import { createVerification, type VerificationOptions } from "../src/verification"
import type { ZKPassportError } from "../src/errors"

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
  test("sends only the request fields the popup needs, with the query translated", () => {
    const { sentToPopup, emitFromPopup } = setupFakeWindow()
    const options: VerificationOptions = {
      purpose: "Age check",
      service: { scope: "kyc-v1", devMode: true },
      query: { age: { min: 18 }, nationality: { included: ["FRA"], disclose: true } },
      onSuccess: () => {},
    }

    createVerification(
      () => options,
      () => {},
    ).verify()
    emitFromPopup({ zkpassport: true, type: "ready" })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configure = sentToPopup[0] as any
    expect(configure.request).toEqual({ purpose: "Age check", scope: "kyc-v1", devMode: true })
    expect(configure.query).toEqual({
      age: { gte: 18 },
      nationality: { in: ["FRA"], disclose: true },
      document_type: { disclose: true },
    })
  })

  test("a policy carries its own query, so the two cannot be combined", () => {
    setupFakeWindow()
    const errors: string[] = []
    createVerification(
      () => ({
        policyId: "kyc-v1",
        query: { age: { min: 18 } },
        onSuccess: () => {},
        onError: (error) => errors.push(error.message),
      }),
      () => {},
    ).verify()
    expect(errors[0]).toContain("remove the query option")
  })

  test("a policy id reaches the popup, and defaults the scope", () => {
    const { sentToPopup, emitFromPopup } = setupFakeWindow()
    createVerification(
      () => ({ policyId: "kyc-v1", onSuccess: () => {} }),
      () => {},
    ).verify()
    emitFromPopup({ zkpassport: true, type: "ready" })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configure = sentToPopup[0] as any
    expect(configure.request).toEqual({ policyId: "kyc-v1", scope: "kyc-v1" })
    // The popup resolves the policy; nothing is asked for on the wire
    expect(configure.query).toEqual({})
  })

  test("maps bind to the wire keys the app reads", () => {
    const { sentToPopup, emitFromPopup } = setupFakeWindow()
    createVerification(
      () => ({
        query: { age: { min: 18 } },
        bind: { account: "0x89D94DA1c6a8564f66e414A8C1C323F96c685006", chainId: 8453 },
      }),
      () => {},
    ).verify()
    emitFromPopup({ zkpassport: true, type: "ready" })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sentToPopup[0] as any).query.bind).toEqual({
      user_address: "0x89D94DA1c6a8564f66e414A8C1C323F96c685006",
      chain: "base",
    })
  })

  test("relays success to onSuccess and waits for it before reporting success", async () => {
    const { emitFromPopup } = setupFakeWindow()
    const statuses: string[] = []
    const received: unknown[] = []
    const verification = createVerification(
      () => ({
        query: { age: { min: 18 } },
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
      () => ({ query: { age: { min: 18 } }, onSuccess: async () => false }),
      (state) => statuses.push(state.status),
    )

    verification.verify()
    emitFromPopup({ zkpassport: true, type: "ready" })
    emitFromPopup({ zkpassport: true, type: "success", proofs: [], result: {} })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(statuses).toEqual(["in-progress", "error"])
  })

  test("a decline is an error with a cancelled kind", () => {
    const { emitFromPopup } = setupFakeWindow()
    const statuses: string[] = []
    const errors: ZKPassportError[] = []
    const verification = createVerification(
      () => ({ query: { age: { min: 18 } }, onError: (e) => errors.push(e) }),
      (state) => statuses.push(state.status),
    )

    verification.verify()
    emitFromPopup({ zkpassport: true, type: "rejected" })

    expect(statuses).toEqual(["in-progress", "error"])
    expect(errors.map((e) => [e.kind, e.cancelled])).toEqual([["rejected", true]])
  })

  // The client infers this by polling `popup.closed`, so the test waits for one poll rather than
  // emitting a message the popup never sends
  test("closing the window returns to idle and reports a cancellation", async () => {
    const { emitFromPopup, popups } = setupFakeWindow()
    const statuses: string[] = []
    const errors: ZKPassportError[] = []
    createVerification(
      () => ({ query: { age: { min: 18 } }, onError: (e) => errors.push(e) }),
      (state) => statuses.push(state.status),
    ).verify()
    emitFromPopup({ zkpassport: true, type: "ready" })
    popups[0].closed = true
    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(statuses).toEqual(["in-progress", "idle"])
    expect(errors.map((e) => [e.kind, e.cancelled])).toEqual([["closed", true]])
  })

  test("only the first terminal outcome is reported", () => {
    const { emitFromPopup } = setupFakeWindow()
    const errors: ZKPassportError[] = []
    createVerification(
      () => ({ query: { age: { min: 18 } }, onError: (e) => errors.push(e) }),
      () => {},
    ).verify()
    emitFromPopup({ zkpassport: true, type: "error", message: "the app failed" })
    emitFromPopup({ zkpassport: true, type: "closed" })

    expect(errors.map((e) => e.kind)).toEqual(["failed"])
  })

  test("disposes a stale popup handle before reopening", async () => {
    const { popups } = setupFakeWindow()
    const verification = createVerification(
      () => ({ query: { age: { min: 18 } } }),
      () => {},
    )

    verification.verify()
    popups[0].closed = true
    verification.verify()

    expect(popups).toHaveLength(2)
  })

  test("dispose after a result leaves the popup open for the user", () => {
    const { emitFromPopup, popups } = setupFakeWindow()
    const verification = createVerification(
      () => ({ query: { age: { min: 18 } } }),
      () => {},
    )

    verification.verify()
    emitFromPopup({ zkpassport: true, type: "success", proofs: [], result: {} })
    verification.dispose()

    expect(popups[0].closed).toBe(false)
  })

  test("close after a result still closes the popup", () => {
    const { emitFromPopup, popups } = setupFakeWindow()
    const verification = createVerification(
      () => ({ query: { age: { min: 18 } } }),
      () => {},
    )

    verification.verify()
    emitFromPopup({ zkpassport: true, type: "success", proofs: [], result: {} })
    verification.close()

    expect(popups[0].closed).toBe(true)
  })

  test("dispose before a result closes the popup", () => {
    const { popups } = setupFakeWindow()
    const verification = createVerification(
      () => ({ query: { age: { min: 18 } } }),
      () => {},
    )

    verification.verify()
    verification.dispose()

    expect(popups[0].closed).toBe(true)
  })

  test("reads callbacks at event time, not click time", () => {
    const { emitFromPopup } = setupFakeWindow()
    const received: string[] = []
    let options: VerificationOptions = {
      query: { age: { min: 18 } },
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

  test("a request with neither a query nor a policy fails before opening a window", () => {
    const { popups } = setupFakeWindow()
    const statuses: string[] = []
    const errors: ZKPassportError[] = []
    createVerification(
      () => ({ onError: (e) => errors.push(e) }),
      (state) => statuses.push(state.status),
    ).verify()

    expect(statuses).toEqual(["error"])
    expect(errors.map((e) => e.kind)).toEqual(["failed"])
    expect(popups).toHaveLength(0)
  })
})

describe("createVerification with mint", () => {
  const account = "0x89D94DA1c6a8564f66e414A8C1C323F96c685006" as const
  const mintOptions = {
    mint: true,
    policyId: "eip155:11155111:0x919a",
    bind: { account, chainId: 11155111 },
  } satisfies VerificationOptions

  test("sends the credential block and an empty query", () => {
    const { sentToPopup, emitFromPopup } = setupFakeWindow()
    createVerification(
      () => mintOptions,
      () => {},
    ).verify()
    emitFromPopup({ zkpassport: true, type: "ready" })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configure = sentToPopup[0] as any
    expect(configure.request).toEqual({ mode: "compressed-evm" })
    expect(configure.credential).toEqual({
      chain: "ethereum_sepolia",
      policyId: "0x919a",
      recipient: account,
    })
    expect(configure.query).toEqual({})
  })

  test("rejects a dashboard policy", () => {
    setupFakeWindow()
    const errors: ZKPassportError[] = []
    createVerification(
      () => ({ ...mintOptions, policyId: "kyc-v1", onError: (e) => errors.push(e) }),
      () => {},
    ).verify()

    expect(errors[0].message).toContain("mint requires an on-chain policyId")
  })

  test("resolves a chainless policy id on the bound chain", () => {
    const { sentToPopup, emitFromPopup } = setupFakeWindow()
    createVerification(
      () => ({ mint: true, policyId: "0x919a", bind: { account, chainId: 8453 } }),
      () => {},
    ).verify()
    emitFromPopup({ zkpassport: true, type: "ready" })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sentToPopup[0] as any).credential).toEqual({
      chain: "base",
      policyId: "0x919a",
      recipient: account,
    })
  })

  test("rejects a chain that disagrees with the policy, and says how to fix it", () => {
    setupFakeWindow()
    const errors: ZKPassportError[] = []
    createVerification(
      () => ({
        mint: true,
        policyId: "eip155:1:0x919a",
        bind: { account, chainId: 8453 },
        onError: (e: ZKPassportError) => errors.push(e),
      }),
      () => {},
    ).verify()

    expect(errors[0].message).toContain("must match the policy's chain (1)")
  })

  test("rejects a malformed recipient", () => {
    setupFakeWindow()
    const errors: ZKPassportError[] = []
    createVerification(
      () => ({
        ...mintOptions,
        bind: { account: "0x1234" as `0x${string}`, chainId: 11155111 },
        onError: (e: ZKPassportError) => errors.push(e),
      }),
      () => {},
    ).verify()

    expect(errors[0].message).toContain("bind.account must be a 0x-prefixed 20-byte address")
  })

  test("relays the credential outcome to onSuccess", () => {
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
      credential: { status: "minted", recipient: account, txHash: "0xdead" },
    })

    expect(outcome.credential).toEqual({ status: "minted", recipient: account, txHash: "0xdead" })
  })
})
