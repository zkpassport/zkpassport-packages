import { afterEach, describe, expect, mock, test } from "bun:test"
import { createElement, render } from "preact"
import { act } from "preact/test-utils"
import * as sdkModule from "@zkpassport/sdk"
import type { Query, QueryBuilder, QueryBuilderResult } from "@zkpassport/sdk"
import type { ZKPassportQRCodeOptions } from "../src/types"
import type { UseCard } from "../src/use-card"

const realSdkExports = { ...sdkModule }

// Stands in for the SDK: like the real one, request() only opens its bridge once
// the round trip finishes, and only cancelRequest / clearAllRequests close it.
class FakeZKPassport {
  static latest: FakeZKPassport | null = null
  readonly openBridges = new Set<string>()
  private counter = 0

  constructor() {
    FakeZKPassport.latest = this
  }

  async request(): Promise<QueryBuilder> {
    const requestId = `topic-${++this.counter}`
    await new Promise((resolve) => setTimeout(resolve, 0))
    this.openBridges.add(requestId)
    return { done: () => fakeRequest(requestId) } as unknown as QueryBuilder
  }

  getServiceDetails(): undefined {
    return undefined
  }

  cancelRequest(requestId: string) {
    this.openBridges.delete(requestId)
  }

  clearAllRequests() {
    this.openBridges.clear()
  }
}

function fakeRequest(requestId: string): QueryBuilderResult {
  const subscribe = () => {}
  return {
    requestId,
    url: `https://zkpassport.id/r?t=${requestId}`,
    query: {} as Query,
    onBridgeConnect: subscribe,
    onRequestReceived: subscribe,
    onGeneratingProof: subscribe,
    onProofGenerated: subscribe,
    onSuccess: subscribe,
    onResult: subscribe,
    onReject: subscribe,
    onError: subscribe,
    isBridgeConnected: () => false,
    requestReceived: () => false,
  } as unknown as QueryBuilderResult
}

mock.module("@zkpassport/sdk", () => ({ ...realSdkExports, ZKPassport: FakeZKPassport }))

// Imported only once the SDK is mocked, so the card builds the fake instead
const loadUseCard = () => import("../src/use-card").then((module) => module.useCard)

// Preact only needs `document` to tell a container apart from the document itself,
// so a bare object is enough for a component that renders nothing.
function fakeDom() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).document = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { firstChild: null, childNodes: [], namespaceURI: undefined } as any
}

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).document
})

const settle = () => act(async () => await new Promise((resolve) => setTimeout(resolve, 0)))

async function mountCard() {
  const useCard = await loadUseCard()
  const options: ZKPassportQRCodeOptions = {
    domain: "example.com",
    query: (builder) => builder.done(),
  }
  let api: UseCard | null = null
  function Probe() {
    api = useCard(options)
    return null
  }

  const container = fakeDom()
  await act(() => {
    render(createElement(Probe, null), container)
  })

  const sdk = FakeZKPassport.latest!
  return {
    openBridges: () => [...sdk.openBridges],
    retry: () => act(() => api!.retry()),
    unmount: () => act(() => render(null, container)),
  }
}

describe("useCard bridge lifecycle", () => {
  test("closes the bridge when the card unmounts", async () => {
    const card = await mountCard()
    await settle()
    expect(card.openBridges()).toHaveLength(1)

    await card.unmount()

    expect(card.openBridges()).toEqual([])
  })

  test("closes the previous bridge but keeps the new one when the card retries", async () => {
    const card = await mountCard()
    await settle()
    const [firstBridge] = card.openBridges()

    await card.retry()
    await settle()

    expect(card.openBridges()).toHaveLength(1)
    expect(card.openBridges()).not.toContain(firstBridge)
  })

  test("closes a bridge that finishes opening after the card unmounts", async () => {
    const card = await mountCard()

    await card.unmount()
    await settle()

    expect(card.openBridges()).toEqual([])
  })
})
