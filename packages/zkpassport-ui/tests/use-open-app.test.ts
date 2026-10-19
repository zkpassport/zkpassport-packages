import { afterEach, describe, expect, test } from "bun:test"
import { createElement, render } from "preact"
import { act } from "preact/test-utils"

import { useOpenApp } from "../src/use-open-app"

const globals = globalThis as unknown as Record<string, unknown>

// Enough of a browser for the probe to attach its listeners and follow the app link
function fakeDom() {
  const listeners = new Map<string, () => void>()
  const events = {
    addEventListener: (type: string, listener: () => void) => void listeners.set(type, listener),
    removeEventListener: (type: string) => void listeners.delete(type),
  }
  globals.document = { ...events, visibilityState: "visible" }
  globals.window = { ...events, location: { href: "" }, setTimeout, clearTimeout }
  return listeners
}

afterEach(() => {
  delete globals.document
  delete globals.window
})

function mountOpenApp() {
  const listeners = fakeDom()
  const container = {
    firstChild: null,
    childNodes: [],
    namespaceURI: undefined,
  } as unknown as Element
  let api: ReturnType<typeof useOpenApp> | null = null

  function Probe({ requestUrl }: { requestUrl: string | null }) {
    api = useOpenApp(requestUrl, { probe: true })
    return null
  }

  return {
    showRequest: (requestUrl: string | null) =>
      act(() => {
        render(createElement(Probe, { requestUrl }), container)
      }),
    tapOpen: () => act(() => api!.openApp()),
    leaveForApp: () =>
      act(() => {
        ;(globals.document as { visibilityState: string }).visibilityState = "hidden"
        listeners.get("visibilitychange")?.()
      }),
    state: () => api!.openState,
  }
}

describe("useOpenApp", () => {
  test("still shows the handoff after the app takes over", async () => {
    const openApp = mountOpenApp()
    await openApp.showRequest("https://zkpassport.id/r?t=first")
    await openApp.tapOpen()

    await openApp.leaveForApp()

    expect(openApp.state()).toBe("opened")
  })

  test("stops waiting on the app once the request is replaced", async () => {
    const openApp = mountOpenApp()
    await openApp.showRequest("https://zkpassport.id/r?t=first")
    await openApp.tapOpen()
    expect(openApp.state()).toBe("opening")

    await openApp.showRequest(null)
    await openApp.showRequest("https://zkpassport.id/r?t=second")

    expect(openApp.state()).toBe("idle")
  })
})
