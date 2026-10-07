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
  let hook: ReturnType<typeof useOpenApp> | null = null

  function Probe({ requestUrl }: { requestUrl: string | null }) {
    hook = useOpenApp(requestUrl, { probe: true })
    return null
  }

  return {
    showRequest: (requestUrl: string | null) =>
      act(() => {
        render(createElement(Probe, { requestUrl }), container)
      }),
    tapOpen: () => act(() => hook!.openApp()),
    openState: () => hook!.openState,
  }
}

describe("useOpenApp", () => {
  test("stops waiting on the app once the request is replaced", async () => {
    const card = mountOpenApp()
    await card.showRequest("https://zkpassport.id/r?t=first")
    await card.tapOpen()
    expect(card.openState()).toBe("opening")

    await card.showRequest(null)
    await card.showRequest("https://zkpassport.id/r?t=second")

    expect(card.openState()).toBe("idle")
  })
})
