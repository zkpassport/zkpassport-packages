import { describe, expect, test } from "bun:test"
import type { Query } from "@zkpassport/utils"
import { ZKPassport } from "../src/index"
import { hydrateQueryBuilder } from "../src/popup/hydrate"
import { openVerificationPopup, isPopupMessage } from "../src/popup"
import type { QueryBuilder } from "../src/types"

function buildOffline(build: (qb: QueryBuilder<"offline">) => unknown): Query {
  const sdk = new ZKPassport("example.com")
  const builder = sdk.createQuery()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = build(builder) as any
  return result.query
}

describe("hydrateQueryBuilder", () => {
  const cases: Array<[string, (qb: QueryBuilder<"offline">) => unknown]> = [
    ["disclose + age", (qb) => qb.disclose("firstname").gte("age", 18).done()],
    ["numeric bounds", (qb) => qb.gt("age", 17).lt("age", 100).lte("age", 99).done()],
    ["range", (qb) => qb.range("age", 18, 65).done()],
    [
      "dates",
      (qb) =>
        qb
          .gte("expiry_date", new Date("2026-01-01"))
          .lte("birthdate", new Date("2008-01-01"))
          .done(),
    ],
    [
      "country lists + eq",
      (qb) =>
        qb
          .in("nationality", ["FRA", "DEU"])
          .out("issuing_country", ["PRK"])
          .eq("document_type", "passport")
          .done(),
    ],
    [
      "bind + sanctions + facematch",
      (qb) =>
        qb
          .bind("user_address", "0x5e4B11F7B7995F5Cee0134692a422b045091112F")
          .bind("custom_data", "customer:123")
          .sanctions("all", "all", { strict: true })
          .facematch("regular")
          .done(),
    ],
    ["empty query (proof of valid ID)", (qb) => qb.done()],
    [
      "policy reference + bind",
      (qb) => qb.policy("pol_123").bind("custom_data", "customer:123").done(),
    ],
  ]

  for (const [name, build] of cases) {
    test(`round-trip: ${name}`, () => {
      const original = buildOffline(build)
      // Simulate the structured clone that postMessage performs
      const cloned = structuredClone(original)
      const hydrated = buildOffline((qb) => hydrateQueryBuilder(qb as never, cloned))
      expect(hydrated).toEqual(original)
    })
  }
})

describe("openVerificationPopup", () => {
  function setupFakeWindow() {
    type Listener = (event: MessageEvent) => void
    const listeners = new Set<Listener>()
    const openedMessages: Array<{ data: unknown; targetOrigin: string }> = []
    const popup = {
      closed: false,
      postMessage: (data: unknown, targetOrigin: string) => {
        openedMessages.push({ data, targetOrigin })
      },
      close() {
        this.closed = true
      },
      focus() {},
    }
    const fakeWindow = {
      screenX: 0,
      screenY: 0,
      outerWidth: 1200,
      outerHeight: 900,
      open: () => popup,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    }
    const emit = (origin: string, data: unknown, source: unknown = popup) => {
      for (const listener of [...listeners]) {
        listener({ origin, data, source } as MessageEvent)
      }
    }
    return { fakeWindow, popup, openedMessages, emit, listeners }
  }

  test("handshake: configure sent on ready; events relayed; origin checked", () => {
    const { fakeWindow, popup, openedMessages, emit } = setupFakeWindow()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = fakeWindow
    try {
      const events: string[] = []
      let successPayload: unknown = null
      const handle = openVerificationPopup({
        popupUrl: "https://verify.zkpassport.id",
        request: { name: "Test", mode: "fast", devMode: true },
        query: { age: { gte: 18 } },
        callbacks: {
          onRequestReceived: () => events.push("request-received"),
          onSuccess: (response) => {
            events.push("success")
            successPayload = response
          },
          onError: (message) => events.push(`error:${message}`),
        },
      })
      expect(handle).not.toBeNull()

      // Wrong origin: ignored
      emit("https://evil.example", { zkpassport: true, type: "ready" })
      expect(openedMessages.length).toBe(0)

      // Correct origin: configure is sent to the popup origin
      emit("https://verify.zkpassport.id", { zkpassport: true, type: "ready" })
      expect(openedMessages.length).toBe(1)
      expect(openedMessages[0].targetOrigin).toBe("https://verify.zkpassport.id")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const configure = openedMessages[0].data as any
      expect(configure.type).toBe("configure")
      expect(configure.query).toEqual({ age: { gte: 18 } })
      expect(configure.request.name).toBe("Test")

      // Events relayed only from the popup origin and source
      emit("https://verify.zkpassport.id", { zkpassport: true, type: "request-received" })
      emit(
        "https://verify.zkpassport.id",
        { zkpassport: true, type: "request-received" },
        { not: "the popup" },
      )
      emit("https://verify.zkpassport.id", {
        zkpassport: true,
        type: "success",
        proofs: [{ proof: "0x1" }],
        result: {},
      })
      expect(events).toEqual(["request-received", "success"])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((successPayload as any).proofs).toEqual([{ proof: "0x1" }])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((successPayload as any).zkpassport).toBeUndefined()

      handle!.close()
      expect(popup.closed).toBe(true)
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window
    }
  })

  test("keeps listening after an error, so a retry still reaches the page", () => {
    const { fakeWindow, emit } = setupFakeWindow()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = fakeWindow
    try {
      const events: string[] = []
      openVerificationPopup({
        popupUrl: "https://verify.zkpassport.id",
        request: {},
        query: {},
        callbacks: {
          onError: (message) => events.push(`error:${message}`),
          onSuccess: () => events.push("success"),
        },
      })

      emit("https://verify.zkpassport.id", {
        zkpassport: true,
        type: "error",
        message: "proof failed",
      })
      emit("https://verify.zkpassport.id", {
        zkpassport: true,
        type: "success",
        proofs: [],
        result: {},
      })

      expect(events).toEqual(["error:proof failed", "success"])
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window
    }
  })

  test("returns null when the popup is blocked", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      open: () => null,
      addEventListener: () => {},
      removeEventListener: () => {},
      outerWidth: 100,
      outerHeight: 100,
    }
    try {
      const handle = openVerificationPopup({
        request: {},
        query: {},
      })
      expect(handle).toBeNull()
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window
    }
  })

  test("isPopupMessage filters garbage", () => {
    expect(isPopupMessage({ zkpassport: true, type: "ready" })).toBe(true)
    expect(isPopupMessage({ type: "ready" })).toBe(false)
    expect(isPopupMessage(null)).toBe(false)
    expect(isPopupMessage("ready")).toBe(false)
  })
})
