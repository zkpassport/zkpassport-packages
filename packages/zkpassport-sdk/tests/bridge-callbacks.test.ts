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
    // Deliver a disconnect through the same listener the SDK registered on the bridge
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
