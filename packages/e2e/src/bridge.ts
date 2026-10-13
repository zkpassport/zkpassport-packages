import { MemoryDataStore } from "bridge/server/datastore/memory"
import { InMemoryRateLimiter } from "bridge/server/ratelimit"
import { startServer } from "bridge/server/server"

export type Bridge = { url: string; stop: () => Promise<void> }

/** Start the bridge from packages/bridge on a free local port, with rate limiting off */
export function startBridge(): Bridge {
  const server = startServer({
    config: { port: 0, hostname: "127.0.0.1" },
    store: new MemoryDataStore(),
    rateLimiter: new InMemoryRateLimiter({ enabled: false }),
  })
  return { url: `ws://127.0.0.1:${server.port}`, stop: () => server.stop() }
}
