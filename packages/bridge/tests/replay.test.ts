/**
 * Tests for the Message Replay feature of this standalone bridge server.
 *
 * Replay lets a client that (re)connects ask the server to resend everything it
 * missed. The contract:
 *
 *   request : {"method":"replay","params":{"timestamp":<ms>}}
 *   response: each stored message for the bridge with timestamp > <ms>, oldest
 *             first, sent RAW (verbatim), then {"status":"replay_complete","count":N}
 *   errors  : {"error":"invalid_timestamp",...}  (missing / non-int / <= 0)
 *             {"error":"replay_already_requested",...}  (second request on a connection)
 *   caching : non-`nocache` messages are stored (with the sender's origin injected);
 *             `nocache` messages (ping/pong) are not. Bridge-scoped. 7-day TTL.
 *
 * Layers:
 *   1. DataStore unit tests (deterministic; LOCAL only — they test this repo's stores).
 *   2. Protocol tests over a real WebSocket.
 *   3. End-to-end through the real ZKPassport Bridge client.
 *
 * Targeting a remote server
 * -------------------------
 * By default an in-process server is started per test. To run the protocol- and
 * client-level tests against an external bridge instead, set BRIDGE_URL:
 *
 *   BRIDGE_URL=wss://bridge-staging.zkpassport.id bun test tests/replay.test.ts
 *
 * When BRIDGE_URL is set, no server is started in-process and the LOCAL-only
 * tests are skipped: the DataStore unit tests, the configurable replay-limit
 * test, the "no timestamp" test (it asserts this server's specific handling,
 * which a remote may not share), and the connection-count-based e2e test (it
 * needs in-process introspection). Each test uses a fresh random bridge id so
 * runs never collide on the shared remote server. NOTE: this opens real
 * connections to and stores real (short-TTL) messages on the target.
 */
import { afterEach, describe, expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { WebSocket } from "ws"
import { startServer, type BridgeServerHandle } from "../server/server"
import { MemoryDataStore } from "../server/datastore/memory"
import { SqliteDataStore } from "../server/datastore/sqlite"
import { InMemoryRateLimiter } from "../server/ratelimit"
import type { DataStore } from "../server/datastore/index"
import { Bridge, type BridgeInterface } from "../acceptance/src"

const REMOTE = process.env.BRIDGE_URL?.trim() || undefined
/** Skip the wrapped test when running against a remote server. */
const localOnly = test.skipIf(Boolean(REMOTE))
/** Unique bridge id per use so runs never collide on a shared remote server. */
const roomId = () => `replay-test-${randomUUID()}`
/** A fresh, unique bridge has no history before this, so replay-from-1 = "everything". */
const FROM_START = 1

// ---------------------------------------------------------------------------
// Test lifecycle helpers
// ---------------------------------------------------------------------------

const handles: BridgeServerHandle[] = []
const sockets: WebSocket[] = []
const clients: BridgeInterface[] = []
const stores: DataStore[] = []

afterEach(async () => {
  for (const b of clients.splice(0)) try { b.cleanup() } catch {}
  for (const ws of sockets.splice(0)) try { ws.close() } catch {}
  for (const h of handles.splice(0)) try { await h.stop() } catch {}
  for (const s of stores.splice(0)) try { await s.close() } catch {}
})

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitFor(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (pred()) return
    await delay(10)
  }
  throw new Error("waitFor timed out")
}

function makeServer(opts: { store?: DataStore; replayLimit?: number } = {}): BridgeServerHandle {
  const h = startServer({
    config: { port: 0, hostname: "127.0.0.1", replayLimit: opts.replayLimit ?? 100 },
    store: opts.store ?? new MemoryDataStore(),
    rateLimiter: new InMemoryRateLimiter({ enabled: false }),
  })
  handles.push(h)
  return h
}

/** Base ws URL for protocol tests: the remote server, or a fresh in-process one. */
function targetBase(opts: { store?: DataStore; replayLimit?: number } = {}): string {
  if (REMOTE) return REMOTE
  return `ws://127.0.0.1:${makeServer(opts).port}`
}

/** Open a raw WebSocket to a bridge and resolve once connected. */
function connect(base: string, query: string, origin = "https://test.example"): Promise<WebSocket> {
  const ws = new WebSocket(`${base}/?${query}`, { headers: { Origin: origin } })
  sockets.push(ws)
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(ws))
    ws.once("error", reject)
  })
}

/** Send a replay request and collect every frame up to (and including) replay_complete. */
function requestReplay(ws: WebSocket, since: number): Promise<{ messages: any[]; count: number }> {
  return new Promise((resolve, reject) => {
    const messages: any[] = []
    const cleanup = () => {
      ws.off("message", onMsg)
      ws.off("close", onClose)
    }
    const onMsg = (raw: Buffer) => {
      const data = JSON.parse(raw.toString())
      if (data.status === "replay_complete") {
        cleanup()
        resolve({ messages, count: data.count })
      } else if (data.error) {
        cleanup()
        const err = new Error(data.error) as Error & { code: string }
        err.code = data.error
        reject(err)
      } else {
        messages.push(data)
      }
    }
    // Fail fast if the connection drops (e.g. remote throttling) rather than hang.
    const onClose = (code: number, reason: Buffer) => {
      cleanup()
      reject(new Error(`connection closed before replay completed (code=${code} reason=${reason?.toString()})`))
    }
    ws.on("message", onMsg)
    ws.on("close", onClose)
    ws.send(JSON.stringify({ method: "replay", params: { timestamp: since } }))
  })
}

const send = (ws: WebSocket, obj: unknown) => ws.send(JSON.stringify(obj))
const msg = (id: string, payload: string) => ({ jsonrpc: "2.0", id, method: "encryptedMessage", params: { payload } })

const storeFactories = [
  { name: "MemoryDataStore", make: (ttlMs?: number) => new MemoryDataStore({ ttlMs }) },
  { name: "SqliteDataStore", make: (ttlMs?: number) => new SqliteDataStore({ path: ":memory:", ttlMs }) },
]

// ---------------------------------------------------------------------------
// 1. DataStore unit tests (deterministic, LOCAL only)
// ---------------------------------------------------------------------------

if (!REMOTE) {
  for (const { name, make } of storeFactories) {
    describe(`DataStore (${name})`, () => {
      // Use timestamps near `now` so the 7-day TTL keeps them live for the read filter.
      test("returns messages with timestamp strictly greater than `since`, oldest first", async () => {
        const store = make()
        stores.push(store)
        const t = Date.now()
        await store.saveMessage("b", t + 1, "m1", "o")
        await store.saveMessage("b", t + 2, "m2", "o")
        await store.saveMessage("b", t + 3, "m3", "o")

        const sinceMid = await store.getMessagesSince("b", t + 2, 100)
        expect(sinceMid.map((m) => m.message)).toEqual(["m3"]) // t+2 excluded (strict >)

        const all = await store.getMessagesSince("b", 0, 100)
        expect(all.map((m) => m.message)).toEqual(["m1", "m2", "m3"]) // ascending
      })

      test("is scoped to the bridge id", async () => {
        const store = make()
        stores.push(store)
        const t = Date.now()
        await store.saveMessage("a", t + 1, "for-a", "o")
        await store.saveMessage("b", t + 1, "for-b", "o")
        expect((await store.getMessagesSince("a", 0, 100)).map((m) => m.message)).toEqual(["for-a"])
        expect((await store.getMessagesSince("b", 0, 100)).map((m) => m.message)).toEqual(["for-b"])
      })

      test("caps results at the limit, keeping the oldest", async () => {
        const store = make()
        stores.push(store)
        const t = Date.now()
        for (let i = 1; i <= 5; i++) await store.saveMessage("b", t + i, `m${i}`, "o")
        const limited = await store.getMessagesSince("b", 0, 3)
        expect(limited.map((m) => m.message)).toEqual(["m1", "m2", "m3"])
      })

      test("clamps a non-integer / negative limit instead of crashing", async () => {
        const store = make()
        stores.push(store)
        const t = Date.now()
        await store.saveMessage("b", t + 1, "m1", "o")
        await store.saveMessage("b", t + 2, "m2", "o")
        expect((await store.getMessagesSince("b", 0, 2.9)).map((m) => m.message)).toEqual(["m1", "m2"])
        expect(await store.getMessagesSince("b", 0, -1)).toEqual([])
      })

      test("excludes messages whose TTL has elapsed", async () => {
        const store = make(5000) // 5s TTL
        stores.push(store)
        const now = Date.now()
        await store.saveMessage("b", now - 10_000, "expired", "o") // expires_at = now-5000 (past)
        await store.saveMessage("b", now, "fresh", "o") //              expires_at = now+5000 (future)
        const result = await store.getMessagesSince("b", 0, 100)
        expect(result.map((m) => m.message)).toEqual(["fresh"])
      })

      test("pruneExpired deletes expired rows", async () => {
        const store = make(5000)
        stores.push(store)
        const now = Date.now()
        await store.saveMessage("b", now, "m", "o")
        expect(await store.getMessagesSince("b", 0, 100)).toHaveLength(1)
        await store.pruneExpired(now + 10_000) // advance past expiry
        expect(await store.getMessagesSince("b", 0, 100)).toHaveLength(0)
      })

      test("setBridgeOriginIfAbsent keeps the first writer", async () => {
        const store = make()
        stores.push(store)
        await store.setBridgeOriginIfAbsent("b", "https://first.example")
        await store.setBridgeOriginIfAbsent("b", "https://second.example")
        expect(await store.getBridgeOrigin("b")).toBe("https://first.example")
        expect(await store.getBridgeOrigin("missing")).toBeUndefined()
      })
    })
  }
}

// ---------------------------------------------------------------------------
// 2. Protocol tests over a real WebSocket
//    Local: run against both backends. Remote: run once against BRIDGE_URL.
// ---------------------------------------------------------------------------

const protocolBackends = REMOTE
  ? [{ name: "remote", make: undefined as undefined | (() => DataStore) }]
  : storeFactories.map((f) => ({ name: f.name, make: () => f.make() as DataStore }))

for (const backend of protocolBackends) {
  describe(`replay protocol (${backend.name})`, () => {
    const base = (replayLimit?: number) =>
      backend.make ? targetBase({ store: backend.make(), replayLimit }) : targetBase()

    test("replays cached messages since timestamp, oldest first, raw, with a count", async () => {
      const room = roomId()
      const b = base()

      const sender = await connect(b, `id=${room}&v=1`, "https://sender.example")
      send(sender, msg("m1", "AAA"))
      send(sender, msg("m2", "BBB"))
      send(sender, msg("m3", "CCC"))
      await delay(100)

      const late = await connect(b, `id=${room}&v=1`, "https://late.example")
      const { messages, count } = await requestReplay(late, FROM_START)

      expect(count).toBe(3)
      expect(messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"])
      // Raw verbatim re-delivery: same shape the sender sent, plus injected origin.
      expect(messages[0]).toEqual({ jsonrpc: "2.0", id: "m1", method: "encryptedMessage", params: { payload: "AAA" }, origin: "https://sender.example" })
    })

    test("does not replay nocache messages (e.g. ping)", async () => {
      const room = roomId()
      const b = base()

      const sender = await connect(b, `id=${room}&v=1`)
      send(sender, msg("keep", "X"))
      send(sender, { method: "ping", params: {}, nocache: true })
      send(sender, { jsonrpc: "2.0", id: "keep2", method: "pong", params: {}, nocache: true })
      await delay(100)

      const late = await connect(b, `id=${room}&v=1`)
      const { messages, count } = await requestReplay(late, FROM_START)
      expect(count).toBe(1)
      expect(messages.map((m) => m.id)).toEqual(["keep"])
      expect(messages.some((m) => m.method === "ping")).toBe(false)
    })

    test("injects the sender origin into stored/replayed messages (anti-spoofing)", async () => {
      const room = roomId()
      const b = base()

      const sender = await connect(b, `id=${room}&v=1`, "https://real.example")
      // Client tries to forge a different origin; server must overwrite it.
      send(sender, { jsonrpc: "2.0", id: "m1", method: "encryptedMessage", params: { payload: "Z" }, origin: "https://evil.example" })
      await delay(100)

      const late = await connect(b, `id=${room}&v=1`, "https://late.example")
      const { messages } = await requestReplay(late, FROM_START)
      expect(messages[0].origin).toBe("https://real.example")
    })

    // The replay limit is server-configured, so this only applies to the local server.
    localOnly("respects the configured replay limit, returning the oldest N", async () => {
      const room = roomId()
      const b = base(2) // replayLimit = 2

      const sender = await connect(b, `id=${room}&v=1`)
      send(sender, msg("m1", "A"))
      send(sender, msg("m2", "B"))
      send(sender, msg("m3", "C"))
      await delay(100)

      const late = await connect(b, `id=${room}&v=1`)
      const { messages, count } = await requestReplay(late, FROM_START)
      expect(count).toBe(2)
      expect(messages.map((m) => m.id)).toEqual(["m1", "m2"])
    })

    test("returns replay_complete with count 0 when nothing matches", async () => {
      const room = roomId()
      const b = base()

      const sender = await connect(b, `id=${room}&v=1`)
      send(sender, msg("old", "A"))
      await delay(100)

      const late = await connect(b, `id=${room}&v=1`)
      const { messages, count } = await requestReplay(late, Date.now() + 3_600_000) // far future => nothing
      expect(count).toBe(0)
      expect(messages).toHaveLength(0)
    })

    test("only allows one replay per connection", async () => {
      const room = roomId()
      const b = base()

      const sender = await connect(b, `id=${room}&v=1`)
      send(sender, msg("m1", "A"))
      await delay(100)

      const client = await connect(b, `id=${room}&v=1`)
      const first = await requestReplay(client, FROM_START)
      expect(first.count).toBe(1)

      await expect(requestReplay(client, FROM_START)).rejects.toMatchObject({ code: "replay_already_requested" })
    })

    test("rejects invalid timestamps", async () => {
      const b = base()
      for (const bad of [0, -1, 1.5]) {
        const c = await connect(b, `id=${roomId()}&v=1`)
        await expect(requestReplay(c, bad as number)).rejects.toMatchObject({ code: "invalid_timestamp" })
      }
    })

    // A timestamp-less replay is rejected here; remote servers may handle it
    // differently, so this asserts this server's specific behaviour — local only.
    localOnly("rejects a replay request with no timestamp", async () => {
      const b = base()
      const c = await connect(b, `id=${roomId()}&v=1`)
      const result = new Promise<any>((resolve) => {
        c.on("message", (raw: Buffer) => resolve(JSON.parse(raw.toString())))
      })
      send(c, { method: "replay", params: {} })
      expect(await result).toMatchObject({ error: "invalid_timestamp" })
    })

    test("scopes replay to the requesting connection's bridge", async () => {
      const roomA = roomId()
      const roomB = roomId()
      const b = base()

      const a = await connect(b, `id=${roomA}&v=1`)
      send(a, msg("a1", "A"))
      const peer = await connect(b, `id=${roomB}&v=1`)
      send(peer, msg("b1", "B"))
      await delay(100)

      const lateB = await connect(b, `id=${roomB}&v=1`)
      const { messages } = await requestReplay(lateB, FROM_START)
      expect(messages.map((m) => m.id)).toEqual(["b1"]) // never sees roomA's message
    })

    test("does not broadcast the replay request or replayed messages to peers", async () => {
      const room = roomId()
      const b = base()

      // peer stores messages while alone, then stays connected and watches.
      const peer = await connect(b, `id=${room}&v=1`)
      send(peer, msg("m1", "A"))
      send(peer, msg("m2", "B"))
      await delay(100)
      const peerFrames: any[] = []
      peer.on("message", (raw: Buffer) => peerFrames.push(JSON.parse(raw.toString())))

      const requester = await connect(b, `id=${room}&v=1`)
      const { count } = await requestReplay(requester, FROM_START)
      expect(count).toBe(2)
      await delay(100) // grace for any (unwanted) broadcast to arrive

      expect(peerFrames).toHaveLength(0) // peer received neither the request nor the replayed messages
    })
  })
}

// ---------------------------------------------------------------------------
// 3. End-to-end through the real ZKPassport Bridge client
// ---------------------------------------------------------------------------

const waitForCb = <T = any>(cb: (resolve: (v?: T) => void) => void): Promise<T> =>
  new Promise<T>((resolve) => cb(resolve as (v?: T) => void))

function onceSecureMessage(bridge: BridgeInterface, method: string): Promise<any> {
  return new Promise((resolve) => {
    const off = bridge.onSecureMessage((m: any) => {
      if (m && m.method === method) {
        off()
        resolve(m)
      }
    })
  })
}

function e2eBridgeUrl(): string {
  return REMOTE ?? `ws://127.0.0.1:${makeServer().port}`
}

describe("replay end-to-end (ZKPassport Bridge client)", () => {
  // Uses in-process connection-count introspection to make the "gone" window
  // deterministic, so it only runs against the local server.
  localOnly("a peer receives an encrypted message it missed while disconnected, via replay", async () => {
    const h = makeServer()
    const bridgeUrl = `ws://127.0.0.1:${h.port}`

    const creator = await Bridge.create({ bridgeUrl, keepalive: false })
    clients.push(creator)
    const creatorSecure = waitForCb(creator.onSecureChannelEstablished)
    await waitForCb(creator.onConnect)

    // First joiner: no auto-reconnect, so we control exactly when it's gone.
    const joiner = await Bridge.join(creator.connectionString, { bridgeUrl, keepalive: false, reconnect: false })
    clients.push(joiner)
    await waitForCb(joiner.onSecureChannelEstablished)
    await creatorSecure

    const before = onceSecureMessage(joiner, "before")
    await creator.sendMessage("before", { n: 1 })
    expect(await before).toEqual({ method: "before", params: { n: 1 } })

    // Drop the joiner and confirm the server has dropped it (deterministic: no reconnect).
    expect(h.bridge.connectionCount(creator.bridgeId)).toBe(2)
    joiner.websocket!.close()
    await waitFor(() => h.bridge.connectionCount(creator.bridgeId) === 1)

    // Creator sends while no joiner is connected: stored, delivered to nobody live.
    await creator.sendMessage("during", { n: 2 })

    // A new client resumes the session (same keypair => same shared secret, no
    // re-handshake) and asks the server to replay. It must receive — and decrypt —
    // the message it missed. (Replay is triggered explicitly to avoid depending on
    // auto-reconnect timing; the client's auto-replay path is covered by the next test.)
    const resumed = await Bridge.join(creator.connectionString, {
      bridgeUrl,
      keepalive: false,
      resume: true,
      keyPair: joiner.getKeyPair(),
    })
    clients.push(resumed)
    await waitForCb(resumed.onSecureChannelEstablished)

    const during = onceSecureMessage(resumed, "during")
    resumed.websocket!.send(JSON.stringify({ method: "replay", params: { timestamp: FROM_START } }))
    expect(await during).toEqual({ method: "during", params: { n: 2 } })
  }, 15000)

  // Exercises the client's automatic reconnect -> replay path (works remotely).
  test("messages exchanged after a reconnect+replay still flow normally", async () => {
    const bridgeUrl = e2eBridgeUrl()

    const creator = await Bridge.create({ bridgeUrl, keepalive: false })
    clients.push(creator)
    const creatorSecure = waitForCb(creator.onSecureChannelEstablished)
    await waitForCb(creator.onConnect)

    const joiner = await Bridge.join(creator.connectionString, { bridgeUrl, keepalive: false })
    clients.push(joiner)
    await waitForCb(joiner.onSecureChannelEstablished)
    await creatorSecure

    joiner.websocket!.close()
    await waitForCb(joiner.onConnect) // reconnected (and replay requested under the hood)

    const echoed = onceSecureMessage(creator, "after-reconnect")
    await joiner.sendMessage("after-reconnect", { ok: true })
    expect(await echoed).toEqual({ method: "after-reconnect", params: { ok: true } })
  }, 15000)
})
