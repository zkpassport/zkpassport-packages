import { afterEach, describe, expect, test } from "bun:test"
import { createElement, render } from "preact"
import { act } from "preact/test-utils"

import { useOpenApp } from "../src/use-open-app"

const globals = globalThis as unknown as Record<string, unknown>

// Enough of a browser for the probe to attach its listeners and follow the app link
function fakeDom() {
  const events = { addEventListener() {}, removeEventListener() {} }
  globals.document = events
  globals.window = { ...events, location: { href: "" }, setTimeout, clearTimeout }
  return { firstChild: null, childNodes: [], namespaceURI: undefined } as unknown as Element
}

afterEach(() => {
  delete globals.document
  delete globals.window
})

function mountOpenApp() {
  const container = fakeDom()
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
    state: () => api!.openState,
  }
}

describe("useOpenApp", () => {
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
