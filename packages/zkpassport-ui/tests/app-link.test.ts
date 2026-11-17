import { afterEach, describe, expect, test } from "bun:test"
import { detectMobileOs, playStoreUrlWithReferrer, toAppSchemeUrl } from "../src/app-link"

const REQUEST_URL = "https://zkpassport.id/r?d=example.com&t=abc&p=1"

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")

function stubNavigator(navigator: Partial<Navigator>) {
  Object.defineProperty(globalThis, "navigator", { value: navigator, configurable: true })
}

// What the mobile app does with the referrer the Play Store hands it
function readRequestUrlFromStoreLink(storeUrl: string): string | null {
  const referrer = new URL(storeUrl).searchParams.get("referrer")
  return referrer === null ? null : new URLSearchParams(referrer).get("zkp_request_url")
}

describe("toAppSchemeUrl", () => {
  test("keeps the query on a /r path, so the app sees a path and not a host", () => {
    expect(toAppSchemeUrl(REQUEST_URL)).toBe("zkpassport:///r?d=example.com&t=abc&p=1")
  })

  test("returns null when the request link is not a URL", () => {
    expect(toAppSchemeUrl("not a url")).toBeNull()
  })
})

describe("playStoreUrlWithReferrer", () => {
  test("carries the request through the install", () => {
    const storeUrl = playStoreUrlWithReferrer(REQUEST_URL)
    expect(new URL(storeUrl).hostname).toBe("play.google.com")
    expect(readRequestUrlFromStoreLink(storeUrl)).toBe(REQUEST_URL)
  })

  test("rewrites another host to the canonical one the app accepts", () => {
    const storeUrl = playStoreUrlWithReferrer("https://verify.zkpassport.id/r?t=abc&p=1")
    expect(readRequestUrlFromStoreLink(storeUrl)).toBe("https://zkpassport.id/r?t=abc&p=1")
  })

  test("falls back to the plain store link when there is no usable request", () => {
    expect(readRequestUrlFromStoreLink(playStoreUrlWithReferrer(null))).toBeNull()
    expect(readRequestUrlFromStoreLink(playStoreUrlWithReferrer("not a url"))).toBeNull()
  })
})

describe("detectMobileOs", () => {
  afterEach(() => {
    if (realNavigator) Object.defineProperty(globalThis, "navigator", realNavigator)
  })

  test("reads iOS from the user agent", () => {
    stubNavigator({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" })
    expect(detectMobileOs()).toBe("ios")
  })

  test("reads iOS from an iPad reporting itself as macOS with touch", () => {
    stubNavigator({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 })
    expect(detectMobileOs()).toBe("ios")
  })

  test("reads Android from the user agent", () => {
    stubNavigator({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)" })
    expect(detectMobileOs()).toBe("android")
  })

  test("reports unknown on a desktop browser", () => {
    stubNavigator({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 })
    expect(detectMobileOs()).toBe("unknown")
  })
})
