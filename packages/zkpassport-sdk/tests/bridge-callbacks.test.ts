/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { BridgeDisconnectedEvent } from "@obsidion/bridge"
import { ZKPassport } from "../src/index"

describe("Bridge connection callbacks", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    // request() fetches the dashboard config best-effort; stub so tests stay offline.
    originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response("{}", {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  async function createRequest() {
    const zkPassport = new ZKPassport("localhost")
    const queryBuilder = await zkPassport.request({ name: "Test App", purpose: "Testing" })
    const request = queryBuilder.done()
    const bridge = (zkPassport as any).topicToBridge[request.requestId]
    // No websocket mock here, so fire the bridge's own disconnected event directly
    const disconnect = (options: { wasIntentionalClose: boolean; willReconnect: boolean }) =>
      bridge.connection.emit(
        "disconnected",
        new BridgeDisconnectedEvent({
          code: 1006,
          reason: "",
          wasConnected: true,
          event: {} as CloseEvent,
          ...options,
        }),
      )
    return { zkPassport, request, disconnect }
  }

  test("reports a lost connection only once the bridge stops reconnecting", async () => {
    const { request, disconnect } = await createRequest()
    let lost = 0
    request.onBridgeConnectionLost(() => {
      lost++
    })

    await disconnect({ wasIntentionalClose: false, willReconnect: true })
    expect(lost).toBe(0)

    await disconnect({ wasIntentionalClose: false, willReconnect: false })
    expect(lost).toBe(1)
  })

  test("does not report a lost connection for an intentional close", async () => {
    const { request, disconnect } = await createRequest()
    let lost = 0
    request.onBridgeConnectionLost(() => {
      lost++
    })

    await disconnect({ wasIntentionalClose: true, willReconnect: false })
    expect(lost).toBe(0)
  })

  test("cancelRequest clears the callback", async () => {
    const { zkPassport, request, disconnect } = await createRequest()
    let lost = 0
    request.onBridgeConnectionLost(() => {
      lost++
    })

    zkPassport.cancelRequest(request.requestId)
    await disconnect({ wasIntentionalClose: false, willReconnect: false })
    expect(lost).toBe(0)
  })
})

describe("isPhoneConnected", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response("{}", {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  async function createRequest(phoneAnswers: boolean) {
    const zkPassport = new ZKPassport("localhost")
    const request = (await zkPassport.request({ name: "Test App", purpose: "Testing" })).done()
    const bridge = (zkPassport as any).topicToBridge[request.requestId]
    const sent: unknown[] = []
    bridge.isBridgeConnected = () => true
    bridge.connection.getWebSocket = () => ({
      send: (data: string) => {
        sent.push(JSON.parse(data))
        if (phoneAnswers) {
          void bridge.connection.emit(
            "raw-message-received",
            JSON.stringify({ method: "pong", params: {}, nocache: true }),
          )
        }
      },
    })
    return { zkPassport, request, sent }
  }

  test("is true when the phone answers a ping", async () => {
    const { zkPassport, request, sent } = await createRequest(true)

    expect(await zkPassport.isPhoneConnected(request.requestId, 200)).toBe(true)
    expect(sent).toEqual([{ method: "ping", params: {}, nocache: true }])
  })

  test("is false when nothing answers in time", async () => {
    const { zkPassport, request } = await createRequest(false)

    expect(await zkPassport.isPhoneConnected(request.requestId, 50)).toBe(false)
  })

  test("is false for a request that no longer exists", async () => {
    const { zkPassport, request } = await createRequest(true)
    zkPassport.cancelRequest(request.requestId)

    expect(await zkPassport.isPhoneConnected(request.requestId, 50)).toBe(false)
  })
})
