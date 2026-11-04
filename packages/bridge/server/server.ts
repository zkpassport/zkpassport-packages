import type { Server, ServerWebSocket } from "bun"
import debug from "debug"
import { Bridge, type ConnectionData } from "./bridge"
import { configFromEnv, type ServerConfig } from "./config"
import type { DataStore } from "./datastore/index"
import { SqliteDataStore } from "./datastore/sqlite"
import { InMemoryRateLimiter, type RateLimiter } from "./ratelimit"

const log = debug("bridge:server")

export interface StartOptions {
  /** Config overrides (merged over environment-derived defaults). */
  config?: Partial<ServerConfig> & { rateLimit?: Partial<ServerConfig["rateLimit"]> }
  /** Inject a DataStore (defaults to SQLite using config.dbPath). */
  store?: DataStore
  /** Inject a RateLimiter (defaults to an in-memory one using config.rateLimit). */
  rateLimiter?: RateLimiter
}

export interface BridgeServerHandle {
  readonly server: Server<ConnectionData>
  readonly bridge: Bridge
  readonly store: DataStore
  readonly port: number
  stop(): Promise<void>
}

function resolveConfig(overrides: StartOptions["config"]): ServerConfig {
  const base = configFromEnv()
  return {
    ...base,
    ...overrides,
    rateLimit: { ...base.rateLimit, ...overrides?.rateLimit },
  }
}

/**
 * Start the WebSocket bridge server.
 *
 * Connection handshake (query string): `?id=<bridgeId>&v=1[&moc=<base64>][&ooc]`
 *   - `id` (or legacy `topic`): the bridge/room id. Required.
 *   - `moc`: base64 "message on connect" — relayed to the bridge as if sent by
 *     this client right after connecting (used to deliver the joiner handshake).
 *   - `ooc`: request the bridge origin be sent back on connect.
 */
export function startServer(options: StartOptions = {}): BridgeServerHandle {
  const config = resolveConfig(options.config)
  const store = options.store ?? new SqliteDataStore({ path: config.dbPath, ttlMs: config.messageTtlMs })
  const rateLimiter = options.rateLimiter ?? new InMemoryRateLimiter(config.rateLimit)
  const bridge = new Bridge(store, {
    replayLimit: config.replayLimit,
    chargeMessage: (ip) => rateLimiter.allow(ip, "message"),
  })

  // Resolve the client IP, honouring X-Forwarded-For only when explicitly trusted.
  const clientIp = (req: Request, srv: Server<ConnectionData>): string => {
    if (config.trustProxy) {
      const xff = req.headers.get("x-forwarded-for")
      if (xff) return xff.split(",")[0]!.trim()
    }
    return srv.requestIP(req)?.address ?? "unknown"
  }

  const server = Bun.serve<ConnectionData>({
    port: config.port,
    hostname: config.hostname,
    fetch(req, srv) {
      const url = new URL(req.url)
      const bridgeId = url.searchParams.get("id") || url.searchParams.get("topic")
      if (!bridgeId) {
        return new Response("Missing bridge id (provide ?id=... or ?topic=...)", { status: 400 })
      }

      const ip = clientIp(req, srv)
      if (!rateLimiter.allow(ip, "connect")) {
        return new Response("Too many connections", { status: 429 })
      }

      const data: ConnectionData = {
        bridgeId,
        // Coerce a missing Origin header to "none", so the sender's origin is
        // always stamped onto relayed/stored messages.
        origin: req.headers.get("origin") ?? "none",
        ip,
        ooc: url.searchParams.has("ooc"),
        moc: url.searchParams.get("moc") ?? undefined,
        replayRequested: false,
      }

      if (srv.upgrade(req, { data })) return undefined
      return new Response("WebSocket upgrade failed", { status: 426 })
    },
    websocket: {
      // Bound per-connection memory (Bun's defaults are 16 MB; set explicitly).
      maxPayloadLength: 16 * 1024 * 1024,
      backpressureLimit: 16 * 1024 * 1024,
      open(ws: ServerWebSocket<ConnectionData>) {
        // Fire-and-forget, but never let a store error become an unhandled
        // rejection that could crash the process.
        bridge.onOpen(ws).catch((err) => log("onOpen error: %s", err))
      },
      message(ws: ServerWebSocket<ConnectionData>, message: string | Buffer) {
        const ip = ws.data.ip
        if (!rateLimiter.allow(ip, "message")) {
          log("message rate limit exceeded ip=%s", ip)
          ws.close(1013, "Rate limit exceeded")
          return
        }
        const raw = typeof message === "string" ? message : message.toString("utf-8")
        bridge.onMessage(ws, raw).catch((err) => log("onMessage error: %s", err))
      },
      close(ws: ServerWebSocket<ConnectionData>) {
        bridge.onClose(ws)
      },
    },
  })

  // Periodically reclaim expired (TTL'd) messages.
  const pruneTimer = setInterval(() => {
    void store.pruneExpired(Date.now())
  }, config.pruneIntervalMs)
  // Don't keep the process alive solely for the prune timer.
  if (typeof pruneTimer === "object" && "unref" in pruneTimer) (pruneTimer as { unref: () => void }).unref()

  log("listening on %s:%d (db=%s, rateLimit=%s)", config.hostname, server.port, config.dbPath, config.rateLimit.enabled)

  return {
    server,
    bridge,
    store,
    port: server.port ?? config.port,
    async stop() {
      clearInterval(pruneTimer)
      server.stop(true)
      await store.close()
    },
  }
}
