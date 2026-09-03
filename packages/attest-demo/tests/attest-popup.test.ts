import { afterEach, describe, expect, test } from "bun:test"
import { parseDemoConfig } from "../lib/config"
import { openAttestPopup, policyIdHex } from "../lib/attest-popup"

const REGISTRY = "0x1111111111111111111111111111111111111111"
const WALLET = "0x2222222222222222222222222222222222222222"

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).window
})

describe("policyIdHex", () => {
  test("pads to a 32-byte hex id", () => {
    expect(policyIdHex(42n)).toBe(`0x${"0".repeat(62)}2a`)
  })
})

describe("openAttestPopup", () => {
  test("configures the popup with the demo's attest block", () => {
    const sent: unknown[] = []
    type Listener = (event: MessageEvent) => void
    const listeners = new Set<Listener>()
    const popup = {
      closed: false,
      focus() {},
      close() {},
      postMessage: (data: unknown) => sent.push(data),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).window = {
      open: () => popup,
      addEventListener: (_: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_: string, listener: Listener) => listeners.delete(listener),
      outerWidth: 1200,
      outerHeight: 900,
    }

    const config = parseDemoConfig({ registry: REGISTRY, popupUrl: "http://localhost:5173" })
    const opened = openAttestPopup(config, 42n, WALLET)
    for (const listener of listeners) {
      listener({
        origin: "http://localhost:5173",
        source: popup,
        data: { zkpassport: true, type: "ready" },
      } as unknown as MessageEvent)
    }

    expect(opened).toBe(popup as never)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const configure = sent[0] as any
    expect(configure.type).toBe("configure")
    expect(configure.query).toEqual({})
    expect(configure.request.devMode).toBe(true)
    expect(configure.request.attest).toEqual({
      chain: "ethereum_sepolia",
      policyId: policyIdHex(42n),
      walletAddress: WALLET,
      registry: REGISTRY,
      rpcUrl: config.rpcUrl,
    })
  })
})
