/**
 * Protocol-level demo / verification of the message-replay feature.
 *
 * Run with:  bun run examples/replay-demo.ts
 *
 * It boots a real server (in-memory store), then drives it with raw WebSocket
 * clients to prove:
 *   - non-`nocache` messages are stored and replayed on request
 *   - `nocache` messages (e.g. ping) are NOT replayed
 *   - the server injects the sender's origin into relayed/stored messages
 *   - replay is allowed once per connection
 *   - invalid timestamps are rejected
 */
import { WebSocket } from "ws"
import { startServer } from "../server/server"
import { MemoryDataStore } from "../server/datastore/memory"
import { InMemoryRateLimiter } from "../server/ratelimit"

const assert = (cond: boolean, msg: string) => {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
  console.log(`  ✓ ${msg}`)
}

const open = (ws: WebSocket) => new Promise<void>((res) => ws.once("open", res))

/** Send replay and collect messages until `replay_complete`. */
function collectReplay(ws: WebSocket, sinceTimestamp: number): Promise<{ messages: any[]; count: number }> {
  return new Promise((resolve, reject) => {
    const messages: any[] = []
    const onMsg = (raw: Buffer) => {
      const data = JSON.parse(raw.toString())
      if (data.status === "replay_complete") {
        ws.off("message", onMsg)
        resolve({ messages, count: data.count })
      } else if (data.error) {
        ws.off("message", onMsg)
        reject(new Error(`${data.error}: ${data.message}`))
      } else {
        messages.push(data)
      }
    }
    ws.on("message", onMsg)
    ws.send(JSON.stringify({ method: "replay", params: { timestamp: sinceTimestamp } }))
  })
}

const handle = startServer({
  config: { port: 0, hostname: "127.0.0.1" },
  store: new MemoryDataStore(),
  rateLimiter: new InMemoryRateLimiter({ enabled: false }),
})
const base = `ws://127.0.0.1:${handle.port}`
const ROOM = "demo-room"
const before = Date.now() - 1000

try {
  console.log(`Server on ${base}\n`)

  // --- Sender connects and emits a mix of cacheable and nocache messages ---
  const sender = new WebSocket(`${base}?id=${ROOM}&v=1`, { headers: { Origin: "https://sender.example" } })
  await open(sender)
  sender.send(JSON.stringify({ jsonrpc: "2.0", id: "m1", method: "encryptedMessage", params: { payload: "AAA" } }))
  sender.send(JSON.stringify({ jsonrpc: "2.0", id: "m2", method: "encryptedMessage", params: { payload: "BBB" } }))
  sender.send(JSON.stringify({ method: "ping", params: {}, nocache: true })) // must NOT be replayed
  sender.send(JSON.stringify({ jsonrpc: "2.0", id: "m3", method: "encryptedMessage", params: { payload: "CCC" } }))
  await new Promise((r) => setTimeout(r, 100))

  // --- A late joiner asks for everything since `before` ---
  console.log("Replay of missed messages:")
  const late = new WebSocket(`${base}?id=${ROOM}&v=1`, { headers: { Origin: "https://late.example" } })
  await open(late)
  const { messages, count } = await collectReplay(late, before)

  assert(count === 3, `replay_complete count is 3 (got ${count})`)
  assert(messages.length === 3, `received 3 replayed messages (got ${messages.length})`)
  assert(
    messages.map((m) => m.id).join(",") === "m1,m2,m3",
    `messages replayed in order m1,m2,m3 (got ${messages.map((m) => m.id).join(",")})`
  )
  assert(
    messages.every((m) => m.origin === "https://sender.example"),
    "server injected sender origin into every stored message"
  )
  assert(
    !messages.some((m) => m.method === "ping"),
    "nocache ping was NOT stored/replayed"
  )

  // --- Second replay on the same connection is rejected ---
  console.log("\nOne-replay-per-connection + validation:")
  let rejected = false
  try {
    await collectReplay(late, before)
  } catch (e) {
    rejected = (e as Error).message.startsWith("replay_already_requested")
  }
  assert(rejected, "second replay on the same connection returns replay_already_requested")

  // --- Invalid timestamp on a fresh connection ---
  const probe = new WebSocket(`${base}?id=${ROOM}&v=1`, { headers: { Origin: "https://probe.example" } })
  await open(probe)
  let invalid = false
  try {
    await collectReplay(probe, 0) // 0 is an invalid timestamp
  } catch (e) {
    invalid = (e as Error).message.startsWith("invalid_timestamp")
  }
  assert(invalid, "timestamp 0 is rejected as invalid_timestamp")

  sender.close()
  late.close()
  probe.close()
  console.log("\n✅ Replay feature verified.")
} finally {
  await handle.stop()
}
