import { afterEach, describe, expect, test } from "bun:test"
import {
  createVerification,
  type VerificationOptions,
  type VerificationState,
} from "../src/verification"
import type { ZKPassportError } from "../src/errors"

const POPUP_ORIGIN = "https://verify.zkpassport.id"
const PAGE_URL = "https://merchant.example/checkout"
const IN_APP_BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS]"
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")

type Listener = (event: MessageEvent) => void

type FakePopup = {
  closed: boolean
  focus: () => void
  close: () => void
  postMessage: (data: unknown) => void
}

function setupFakeWindow(storage: Map<string, string> = new Map()) {
  const listeners = new Set<Listener>()
  const sentToPopup: unknown[] = []
  const popups: FakePopup[] = []
  const openedUrls: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).window = {
    location: { href: PAGE_URL, hostname: "merchant.example" },
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    },
    open: (url: string) => {
      openedUrls.push(url)
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
  // What a popup the browser discarded and rebuilt looks like: same origin, different window
  const emitFromRebuiltPopup = (data: unknown) => {
    for (const listener of [...listeners]) {
      listener({ origin: POPUP_ORIGIN, data, source: {} } as MessageEvent)
    }
  }
  return { sentToPopup, emitFromPopup, emitFromRebuiltPopup, popups, openedUrls, storage }
}

function sessionOf(popupUrl: string): string | null {
  return new URL(popupUrl).searchParams.get("s")
}

const PENDING_KEY = "zkpassport:pending-verification"

const SIMPLE_OPTIONS: VerificationOptions = { query: { age: { min: 18 } } }

function stubInAppBrowser() {
  Object.defineProperty(globalThis, "navigator", {
    value: { userAgent: IN_APP_BROWSER_UA },
    configurable: true,
  })
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window
  if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator)
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

  test("an in-app browser is turned away before a window opens, and offered this page's URL", () => {
    const { popups } = setupFakeWindow()
    stubInAppBrowser()
    const states: VerificationState[] = []
    createVerification(
      () => ({ query: { age: { min: 18 } } }),
      (state) => states.push(state),
    ).verify()

    expect(popups).toHaveLength(0)
    expect(states.map((state) => state.errorKind)).toEqual(["blocked"])
    expect(states[0].openInBrowserUrl).toBe(PAGE_URL)
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
      credential: {
        policyId: "0x919a",
        account,
        chainId: 11155111,
        contract: "0x000C558ea450790ad88f4f15A302B8F2C9b60d6C",
        txHash: "0xdead",
      },
    })

    expect(outcome.credential).toEqual({
      policyId: "0x919a",
      account,
      chainId: 11155111,
      contract: "0x000C558ea450790ad88f4f15A302B8F2C9b60d6C",
      txHash: "0xdead",
    })
  })
})

describe("picking a verification back up after the page was rebuilt", () => {
  test("carries the verification in the popup's URL, so a reload can find it again", () => {
    const { openedUrls, storage } = setupFakeWindow()

    createVerification(
      () => SIMPLE_OPTIONS,
      () => {},
    ).verify()

    const session = sessionOf(openedUrls[0])
    expect(session).toBeTruthy()
    expect(JSON.parse(storage.get(PENDING_KEY)!).session).toBe(session)
  })

  test("a controller built after a reload offers to continue, and reopens the same one", () => {
    const storage = new Map<string, string>()
    const first = setupFakeWindow(storage)
    createVerification(
      () => SIMPLE_OPTIONS,
      () => {},
    ).verify()
    const session = sessionOf(first.openedUrls[0])

    const second = setupFakeWindow(storage)
    const rebuilt = createVerification(
      () => SIMPLE_OPTIONS,
      () => {},
    )

    expect(rebuilt.state.resumable).toBe(true)
    rebuilt.verify()
    expect(sessionOf(second.openedUrls[0])).toBe(session)
  })

  test("the reopened popup's result reaches the rebuilt page", () => {
    const storage = new Map<string, string>()
    setupFakeWindow(storage)
    createVerification(
      () => SIMPLE_OPTIONS,
      () => {},
    ).verify()

    const { emitFromPopup } = setupFakeWindow(storage)
    let delivered: unknown = null
    const rebuilt = createVerification(
      () => ({ ...SIMPLE_OPTIONS, onSuccess: (response) => void (delivered = response) }),
      () => {},
    )
    rebuilt.verify()
    emitFromPopup({ zkpassport: true, type: "success", proofs: [], result: {} })

    expect(delivered).toEqual({ proofs: [], result: {} })
    expect(storage.has(PENDING_KEY)).toBe(false)
  })

  test("a verification that ended leaves nothing to continue", () => {
    const storage = new Map<string, string>()
    const { emitFromPopup } = setupFakeWindow(storage)
    createVerification(
      () => SIMPLE_OPTIONS,
      () => {},
    ).verify()
    expect(storage.has(PENDING_KEY)).toBe(true)

    emitFromPopup({ zkpassport: true, type: "rejected" })

    expect(storage.has(PENDING_KEY)).toBe(false)
    expect(
      createVerification(
        () => SIMPLE_OPTIONS,
        () => {},
      ).state.resumable,
    ).toBe(false)
  })

  test("does not offer to continue a verification too old to still be running", () => {
    const storage = new Map<string, string>()
    storage.set(
      PENDING_KEY,
      JSON.stringify({ session: "stale", startedAt: Date.now() - 31 * 60 * 1000 }),
    )
    const { openedUrls } = setupFakeWindow(storage)

    const controller = createVerification(
      () => SIMPLE_OPTIONS,
      () => {},
    )
    expect(controller.state.resumable).toBe(false)

    controller.verify()
    expect(sessionOf(openedUrls[0])).not.toBe("stale")
  })
})

describe("a popup the browser rebuilt", () => {
  test("delivers its result even after the window was reported gone", async () => {
    const { emitFromRebuiltPopup, openedUrls, popups } = setupFakeWindow()
    let delivered: unknown = null
    let closed = false
    createVerification(
      () => ({
        ...SIMPLE_OPTIONS,
        onSuccess: (response) => void (delivered = response),
        onError: (error) => void (closed = error.kind === "closed"),
      }),
      () => {},
    ).verify()

    popups[0].closed = true
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(closed).toBe(true)

    emitFromRebuiltPopup({
      zkpassport: true,
      type: "success",
      session: sessionOf(openedUrls[0]),
      proofs: [],
      result: {},
    })

    expect(delivered).toEqual({ proofs: [], result: {} })
  })

  test("delivers its result, since the window handle no longer identifies it", () => {
    const { emitFromRebuiltPopup, openedUrls } = setupFakeWindow()
    let delivered: unknown = null
    createVerification(
      () => ({ ...SIMPLE_OPTIONS, onSuccess: (response) => void (delivered = response) }),
      () => {},
    ).verify()

    emitFromRebuiltPopup({
      zkpassport: true,
      type: "success",
      session: sessionOf(openedUrls[0]),
      proofs: [],
      result: {},
    })

    expect(delivered).toEqual({ proofs: [], result: {} })
  })

  test("is ignored when it names a different verification", () => {
    const { emitFromRebuiltPopup } = setupFakeWindow()
    let delivered: unknown = null
    createVerification(
      () => ({ ...SIMPLE_OPTIONS, onSuccess: (response) => void (delivered = response) }),
      () => {},
    ).verify()

    emitFromRebuiltPopup({
      zkpassport: true,
      type: "success",
      session: "someone-else",
      proofs: [],
      result: {},
    })

    expect(delivered).toBeNull()
  })
})
