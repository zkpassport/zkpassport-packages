import { Database } from "bun:sqlite"
import type { DataStore, StoredMessage } from "./index"

/** Default message retention: 7 days. */
export const DEFAULT_MESSAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface SqliteDataStoreOptions {
  /** Path to the SQLite file, or ":memory:" for an in-process DB. Default ":memory:". */
  path?: string
  /** Message time-to-live in milliseconds. Default 7 days. */
  ttlMs?: number
}

/**
 * SQLite-backed DataStore (via Bun's built-in `bun:sqlite`).
 *
 * Messages are kept until `expires_at`; `getMessagesSince` filters out expired
 * rows on read and `pruneExpired` reclaims them. Bridge origins persist for the
 * lifetime of the database.
 */
export class SqliteDataStore implements DataStore {
  private readonly db: Database
  private readonly ttlMs: number

  constructor(options: SqliteDataStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_MESSAGE_TTL_MS
    this.db = new Database(options.path ?? ":memory:")
    // WAL gives better concurrent read/write behaviour for a long-running server.
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA busy_timeout = 5000")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        bridge_id  TEXT    NOT NULL,
        timestamp  INTEGER NOT NULL,
        message    TEXT    NOT NULL,
        origin     TEXT,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_bridge_ts ON messages (bridge_id, timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_expires ON messages (expires_at);

      CREATE TABLE IF NOT EXISTS bridges (
        bridge_id TEXT PRIMARY KEY,
        origin    TEXT,
        created   INTEGER NOT NULL
      );
    `)
  }

  async saveMessage(bridgeId: string, timestamp: number, message: string, origin?: string): Promise<void> {
    this.db
      .query(
        "INSERT INTO messages (bridge_id, timestamp, message, origin, expires_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(bridgeId, timestamp, message, origin ?? null, timestamp + this.ttlMs)
  }

  async getMessagesSince(bridgeId: string, since: number, limit: number): Promise<StoredMessage[]> {
    // Guard against a non-integer/negative limit: SQLite would throw a datatype
    // mismatch on a float, and a negative LIMIT means "no limit".
    const safeLimit = Math.max(0, Math.trunc(limit))
    const rows = this.db
      .query(
        `SELECT message, origin, timestamp
           FROM messages
          WHERE bridge_id = ? AND timestamp > ? AND expires_at > ?
          ORDER BY timestamp ASC, id ASC
          LIMIT ?`
      )
      .all(bridgeId, since, Date.now(), safeLimit) as Array<{
      message: string
      origin: string | null
      timestamp: number
    }>
    return rows.map((r) => ({ message: r.message, origin: r.origin ?? undefined, timestamp: r.timestamp }))
  }

  async setBridgeOriginIfAbsent(bridgeId: string, origin: string): Promise<void> {
    // INSERT OR IGNORE keeps the first writer's origin (first connection wins).
    this.db
      .query("INSERT OR IGNORE INTO bridges (bridge_id, origin, created) VALUES (?, ?, ?)")
      .run(bridgeId, origin, Date.now())
  }

  async getBridgeOrigin(bridgeId: string): Promise<string | undefined> {
    const row = this.db.query("SELECT origin FROM bridges WHERE bridge_id = ?").get(bridgeId) as
      | { origin: string | null }
      | null
    return row?.origin ?? undefined
  }

  async pruneExpired(now: number): Promise<void> {
    this.db.query("DELETE FROM messages WHERE expires_at <= ?").run(now)
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
