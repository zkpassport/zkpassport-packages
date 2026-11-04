import debug from "debug"
import type { DataStore } from "./datastore/index"

const log = debug("bridge:server")

/** Per-connection state attached to each WebSocket. */
export interface ConnectionData {
  /** The bridge (room) id from the `id` (or `topic`) query param. */
  bridgeId: string
  /** Origin header of this connection; defaults to "none" when absent. */
  origin: string
  /** Source IP (for rate limiting / logging). */
  ip: string
  /** Whether the connection requested origin-on-connect (`ooc` query param). */
  ooc: boolean
  /** Base64 message-on-connect (`moc` query param), if any. */
  moc?: string
  /** One replay allowed per connection — flips true after the first request. */
  replayRequested: boolean
}

/** Minimal socket surface the bridge needs — satisfied by Bun's ServerWebSocket. */
export interface BridgeSocket {
  readonly data: ConnectionData
  readonly readyState: number
  send(data: string): unknown
  close(code?: number, reason?: string): void
}

const WS_OPEN = 1

/** Strict standard-base64 (with optional padding) — rejects malformed `moc`. */
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Core bridge logic, independent of the transport.
 *
 * It is a transparent relay: it never decrypts payloads. It routes JSON
 * messages between the connections sharing a bridge id, injects the sender's
 * origin, caches messages for replay, and implements the message-on-connect,
 * origin-on-connect and replay features.
 */
export class Bridge {
  /** bridgeId -> live sockets. Inherently per-process. */
  private readonly rooms = new Map<string, Set<BridgeSocket>>()

  constructor(
    private readonly store: DataStore,
    private readonly opts: {
      replayLimit: number
      /**
       * Charge a "message" rate-limit unit for a message-on-connect payload, so
       * a `moc` counts the same as a normal message. Returns false if the
       * connection is over its message budget. Optional — no-op if omitted.
       */
      chargeMessage?: (ip: string) => boolean
    }
  ) {}

  /** Number of live connections to a bridge (used by tests / introspection). */
  connectionCount(bridgeId: string): number {
    return this.rooms.get(bridgeId)?.size ?? 0
  }

  /** Handle a newly-opened connection. */
  async onOpen(ws: BridgeSocket): Promise<void> {
    const { bridgeId, origin, ooc, moc } = ws.data

    // Register in the room.
    let room = this.rooms.get(bridgeId)
    if (!room) {
      room = new Set()
      this.rooms.set(bridgeId, room)
    }
    room.add(ws)
    log("open bridge=%s origin=%s ooc=%s moc=%s peers=%d", bridgeId, origin, ooc, !!moc, room.size)

    // The first connection's origin becomes the bridge origin (always defined,
    // "none" when the client sent no Origin header).
    await this.store.setBridgeOriginIfAbsent(bridgeId, origin)

    // Origin on connect: send the stored bridge origin back to this client.
    if (ooc) {
      const storedOrigin = await this.store.getBridgeOrigin(bridgeId)
      if (storedOrigin) {
        ws.send(JSON.stringify({ jsonrpc: "2.0", method: "ooc", params: { origin: storedOrigin } }))
      }
    }

    // Message on connect: decode and treat as an incoming message from this client.
    if (moc) {
      // Buffer.from(base64) is lenient and never throws, so validate explicitly.
      // A malformed moc closes the connection (1008).
      if (!BASE64_RE.test(moc)) {
        ws.close(1008, "Invalid message on connect")
        return
      }
      const decoded = Buffer.from(moc, "base64").toString("utf-8").trim()
      if (!decoded) {
        ws.close(1008, "Empty message on connect")
        return
      }
      try {
        JSON.parse(decoded)
      } catch {
        ws.close(1008, "Invalid message on connect")
        return
      }
      // A moc payload counts as one message for rate limiting.
      if (this.opts.chargeMessage && !this.opts.chargeMessage(ws.data.ip)) {
        ws.close(1013, "Rate limit exceeded")
        return
      }
      await this.onMessage(ws, decoded)
    }
  }

  /** Handle an inbound message frame (a JSON string). */
  async onMessage(ws: BridgeSocket, raw: string): Promise<void> {
    if (!raw || !raw.trim()) return

    let msg: any
    try {
      msg = JSON.parse(raw)
    } catch {
      // Invalid JSON is dropped (never relayed).
      log("dropping invalid JSON from bridge=%s", ws.data.bridgeId)
      return
    }

    // Replay requests are handled by the server and never relayed to peers.
    if (msg && msg.method === "replay") {
      await this.handleReplay(ws, msg)
      return
    }

    // Inject the sender's origin (overwriting any client-supplied value). Always
    // set — "none" when the client sent no Origin header — so a peer can never
    // forge the origin field the joiner verifies against.
    msg.origin = ws.data.origin
    const serialized = JSON.stringify(msg)

    // Cache for replay unless explicitly opted out (e.g. ping/pong set nocache).
    if (!msg.nocache) {
      await this.store.saveMessage(ws.data.bridgeId, Date.now(), serialized, ws.data.origin)
    }

    // Relay to every other live peer on this bridge.
    this.broadcast(ws.data.bridgeId, serialized, ws)
  }

  /** Handle connection close. */
  onClose(ws: BridgeSocket): void {
    const room = this.rooms.get(ws.data.bridgeId)
    if (!room) return
    room.delete(ws)
    if (room.size === 0) this.rooms.delete(ws.data.bridgeId)
    log("close bridge=%s peers=%d", ws.data.bridgeId, room.size)
  }

  /** Replay messages this connection missed, then confirm completion. */
  private async handleReplay(ws: BridgeSocket, msg: any): Promise<void> {
    if (ws.data.replayRequested) {
      ws.send(
        JSON.stringify({
          error: "replay_already_requested",
          message: "Replay can only be requested once per connection",
        })
      )
      return
    }

    const ts = msg?.params?.timestamp
    if (typeof ts !== "number" || !Number.isInteger(ts) || ts <= 0) {
      ws.send(
        JSON.stringify({
          error: "invalid_timestamp",
          message: "Invalid timestamp provided for replay request",
        })
      )
      return
    }

    ws.data.replayRequested = true
    const missed = await this.store.getMessagesSince(ws.data.bridgeId, ts, this.opts.replayLimit)
    log("replay bridge=%s since=%d count=%d", ws.data.bridgeId, ts, missed.length)
    for (const m of missed) ws.send(m.message)
    ws.send(JSON.stringify({ status: "replay_complete", count: missed.length }))
  }

  /** Send `data` to all live peers on `bridgeId` except `sender`. */
  private broadcast(bridgeId: string, data: string, sender: BridgeSocket): void {
    const room = this.rooms.get(bridgeId)
    if (!room) return
    for (const peer of room) {
      if (peer === sender || peer.readyState !== WS_OPEN) continue
      try {
        peer.send(data)
      } catch (err) {
        log("send failed bridge=%s: %s", bridgeId, err)
      }
    }
  }
}
