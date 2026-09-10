import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { ZKPassport } from "@zkpassport/sdk"
import type { QueryBuilder, QueryBuilderResult } from "@zkpassport/sdk"
import { mount } from "../src/vanilla"

// Test-only DOM so preact can render the card under bun. A dev dependency, never shipped.
beforeAll(() => {
  GlobalRegistrator.register()
})

afterAll(async () => {
  await GlobalRegistrator.unregister()
})

type Listener = (...args: unknown[]) => void
type FakeRequest = {
  request: QueryBuilderResult
  // Fire one of the SDK callbacks the card subscribed to
  fire: (event: string, ...args: unknown[]) => void
  // Resolve the pending sdk.request() call
  release: () => void
  ready: Promise<void>
}

function fakeRequest(id: string): FakeRequest {
  const listeners: Record<string, Listener[]> = {}
  const on = (name: string) => (callback: Listener) => {
    ;(listeners[name] ??= []).push(callback)
  }
  const request = {
    url: `https://zkpassport.id/r?t=${id}`,
    query: {},
    requestId: id,
    onRequestReceived: on("onRequestReceived"),
    onGeneratingProof: on("onGeneratingProof"),
    onBridgeConnect: on("onBridgeConnect"),
    onBridgeConnectionLost: on("onBridgeConnectionLost"),
    onProofGenerated: on("onProofGenerated"),
    onSuccess: on("onSuccess"),
    onResult: on("onResult"),
    onReject: on("onReject"),
    onError: on("onError"),
    isBridgeConnected: () => false,
    requestReceived: () => false,
  } as unknown as QueryBuilderResult
  const fire = (name: string, ...args: unknown[]) => {
    for (const callback of listeners[name] ?? []) callback(...args)
  }
  let release!: () => void
  const ready = new Promise<void>((resolve) => {
    release = resolve
  })
  return { request, fire, release, ready }
}

const requests: FakeRequest[] = []
const sdkCalls: string[] = []
let holdRequests = false
let spies: Array<{ mockRestore: () => void }> = []

beforeEach(() => {
  requests.length = 0
  sdkCalls.length = 0
  holdRequests = false
  spies = [
    spyOn(ZKPassport.prototype, "request").mockImplementation(() => {
      const fake = fakeRequest(`request-${requests.length + 1}`)
      requests.push(fake)
      if (!holdRequests) fake.release()
      return fake.ready.then(() => ({ done: () => fake.request }) as unknown as QueryBuilder)
    }),
    spyOn(ZKPassport.prototype, "cancelRequest").mockImplementation((requestId: string) => {
      sdkCalls.push(`cancelRequest:${requestId}`)
    }),
    spyOn(ZKPassport.prototype, "clearAllRequests").mockImplementation(() => {
      sdkCalls.push("clearAllRequests")
    }),
  ]
})

afterEach(() => {
  for (const spy of spies) spy.mockRestore()
  document.body.innerHTML = ""
})

// Preact runs effects after the next frame, so poll instead of sleeping a fixed time
async function waitFor(condition: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out waiting for the card")
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

function mountCard() {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const handle = mount(host, { domain: "localhost", query: (builder) => builder.done() })
  const state = () => host.querySelector(".zkp-card")?.getAttribute("data-state")
  return { host, handle, state }
}

describe("Card", () => {
  test("shows the connection lost state until the bridge comes back", async () => {
    const { host, handle, state } = mountCard()
    await waitFor(() => state() === "connecting")

    requests[0].fire("onBridgeConnect")
    await waitFor(() => state() === "waiting")

    requests[0].fire("onBridgeConnectionLost")
    await waitFor(() => state() === "disconnected")
    expect(host.querySelector(".zkp-overlay-caption")?.textContent).toBe("Connection lost")
    expect(host.querySelector(".zkp-retry")).not.toBeNull()

    // Every failed retry round reports the loss again
    requests[0].fire("onBridgeConnectionLost")
    await settle()
    requests[0].fire("onBridgeConnect")
    await waitFor(() => state() === "waiting")
    handle.unmount()
  })

  test("keeps the final screen when the connection is lost after a result", async () => {
    const { handle, state } = mountCard()
    await waitFor(() => state() === "connecting")

    requests[0].fire("onBridgeConnect")
    requests[0].fire("onSuccess", { proofs: [], result: {} })
    await waitFor(() => state() === "success")

    requests[0].fire("onBridgeConnectionLost")
    await settle()
    expect(state()).toBe("success")
    handle.unmount()
  })

  test("restart cancels the previous request", async () => {
    const { handle, state } = mountCard()
    await waitFor(() => state() === "connecting")

    handle.retry()
    await waitFor(() => requests.length === 2)
    expect(sdkCalls).toEqual(["clearAllRequests"])
    handle.unmount()
  })

  test("unmount cancels the request, even one still being set up", async () => {
    const first = mountCard()
    await waitFor(() => first.state() === "connecting")
    first.handle.unmount()
    expect(sdkCalls).toEqual(["clearAllRequests"])

    holdRequests = true
    const second = mountCard()
    await waitFor(() => requests.length === 2)
    second.handle.unmount()
    requests[1].release()
    await waitFor(() => sdkCalls.length === 3)
    expect(sdkCalls).toEqual(["clearAllRequests", "clearAllRequests", "cancelRequest:request-2"])
  })
})
