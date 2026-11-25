import { describe, expect, test } from "bun:test"
import { waitForBridgeConnection } from "../src/bridge-connection"

function fakeBridge() {
  let connected = false
  const onConnect: (() => void)[] = []
  const onFailed: (() => void)[] = []
  const subscribe = (list: (() => void)[]) => (callback: () => void) => {
    list.push(callback)
    return () => {
      list.splice(list.indexOf(callback), 1)
    }
  }
  return {
    bridge: {
      isBridgeConnected: () => connected,
      onConnect: subscribe(onConnect),
      onFailedToConnect: subscribe(onFailed),
    },
    open: () => {
      connected = true
      onConnect.slice().forEach((callback) => callback())
    },
    fail: () => onFailed.slice().forEach((callback) => callback()),
    listeners: () => onConnect.length + onFailed.length,
  }
}

describe("waitForBridgeConnection", () => {
  test("is done at once for a bridge that is already connected", async () => {
    const { bridge, open } = fakeBridge()
    open()
    expect(await waitForBridgeConnection(bridge, 1000)).toBe(true)
  })

  test("holds until the connection opens", async () => {
    const { bridge, open, listeners } = fakeBridge()
    let settled = false
    const waiting = waitForBridgeConnection(bridge, 1000).then((result) => {
      settled = true
      return result
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(settled).toBe(false)
    open()
    expect(await waiting).toBe(true)
    expect(listeners()).toBe(0)
  })

  test("gives up when the bridge cannot be reached", async () => {
    const { bridge, fail } = fakeBridge()
    const waiting = waitForBridgeConnection(bridge, 1000)
    fail()
    expect(await waiting).toBe(false)
  })

  test("gives up after the timeout", async () => {
    const { bridge, listeners } = fakeBridge()
    expect(await waitForBridgeConnection(bridge, 20)).toBe(false)
    expect(listeners()).toBe(0)
  })
})
