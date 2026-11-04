/**
 * DataStore abstraction.
 *
 * The bridge persists two things:
 *   1. Messages — for the "replay on (re)connect" feature. A client that
 *      reconnects can ask the server to resend everything it missed since a
 *      given timestamp.
 *   2. Bridge origin — the Origin header of the first connection to a bridge.
 *      Sent back to later joiners via the "origin on connect" (ooc) feature.
 *
 * Everything else (which sockets are live, routing) is inherently per-process
 * and lives in the server, not here.
 *
 * Implement this interface to plug in a different backend (Postgres, Redis,
 * etc.). The default implementation is SQLite (see ./sqlite.ts); an in-memory
 * implementation (./memory.ts) is used by the test harness.
 */

export interface StoredMessage {
  /** The full message JSON string, exactly as it should be re-delivered. */
  message: string
  /** The origin that sent the message (may be undefined). */
  origin?: string
  /** Milliseconds since epoch when the message was received by the server. */
  timestamp: number
}

export interface DataStore {
  /**
   * Persist a message for later replay.
   * @param bridgeId  The bridge (room) the message belongs to.
   * @param timestamp Milliseconds since epoch (server receive time).
   * @param message   The full message JSON string to re-deliver verbatim.
   * @param origin    The origin of the sender (optional).
   */
  saveMessage(bridgeId: string, timestamp: number, message: string, origin?: string): Promise<void>

  /**
   * Return messages for a bridge with timestamp strictly greater than `since`,
   * ordered oldest-first, capped at `limit`. Expired messages are excluded.
   */
  getMessagesSince(bridgeId: string, since: number, limit: number): Promise<StoredMessage[]>

  /**
   * Record the bridge origin, but only if one is not already set (first writer
   * wins — the first connection to a bridge sets its origin).
   */
  setBridgeOriginIfAbsent(bridgeId: string, origin: string): Promise<void>

  /** Get the stored origin for a bridge, if any. */
  getBridgeOrigin(bridgeId: string): Promise<string | undefined>

  /** Delete messages whose TTL has elapsed (relative to `now` ms). */
  pruneExpired(now: number): Promise<void>

  /** Release any underlying resources. */
  close(): Promise<void>
}

export type { DataStore as IDataStore }
