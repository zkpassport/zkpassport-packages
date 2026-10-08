/**
 * Acceptance test harness.
 *
 * This preload makes the ZKPassport Bridge client test suite (acceptance/tests)
 * run against the real standalone server in this repo instead of the in-memory
 * mock. It does two things:
 *
 *   1. Boots the bridge server on an ephemeral local port (memory datastore,
 *      rate limiting off — so test volume never trips a limit).
 *   2. Replaces the client's WebSocket factory (acceptance/src/websocket.ts) so
 *      every connection is rewritten to ws://127.0.0.1:<port>, preserving the
 *      query string. The test files themselves are untouched.
 *
 * Run with:  USE_REAL_BRIDGE_SERVER=1 bun test --preload ./acceptance/setup.real.ts acceptance/tests/
 * (see package.json "test:real").
 */
import { afterAll, mock } from "bun:test"
import { startServer } from "../server/server"
import { MemoryDataStore } from "../server/datastore/memory"
import { InMemoryRateLimiter } from "../server/ratelimit"

const handle = startServer({
  config: { port: 0, hostname: "127.0.0.1" },
  store: new MemoryDataStore(),
  rateLimiter: new InMemoryRateLimiter({ enabled: false }),
})

const PORT = handle.port

// `./src/websocket` from THIS file resolves to acceptance/src/websocket.ts —
// the same module the vendored client imports as `./websocket`.
mock.module("./src/websocket", () => makeWebsocketModule(PORT))

function makeWebsocketModule(port: number) {
  return {
    isNodeEnvironment: () => true,
    getWebSocketClient: async (url: string, origin?: string) => {
      const u = new URL(url)
      u.protocol = "ws:"
      u.host = `127.0.0.1:${port}`
      const { default: WS } = await import("ws")
      // Mirrors the real client: send the Origin header (default "nodejs" in Node).
      return new WS(u.toString(), { headers: { Origin: origin || "nodejs" } })
    },
  }
}

afterAll(async () => {
  await handle.stop()
})
