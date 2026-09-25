/**
 * The bridge relay server, started in-process.
 *
 * The repo is private and not on npm, so this package does not declare it; for local runs it is
 * installed as an optional git dependency from a local-only commit. Its code, and that dependency,
 * must never be committed to this repo.
 */
const RELAY_PACKAGE = "bridge-relay"

export type Relay = { url: string; stop: () => Promise<void> }

/** Whether the relay package is installed (it is optional; see above) */
export async function isRelayInstalled(): Promise<boolean> {
  try {
    await import(`${RELAY_PACKAGE}/server/server.ts`)
    return true
  } catch {
    return false
  }
}

/** Start the relay on a free local port, with rate limiting off and an in-memory store */
export async function startRelay(): Promise<Relay> {
  const { startServer } = await import(`${RELAY_PACKAGE}/server/server.ts`)
  const { MemoryDataStore } = await import(`${RELAY_PACKAGE}/server/datastore/memory.ts`)
  const server = startServer({
    config: { port: 0, hostname: "127.0.0.1", rateLimit: { enabled: false } },
    store: new MemoryDataStore(),
  })
  return { url: `ws://127.0.0.1:${server.port}`, stop: () => server.stop() }
}
