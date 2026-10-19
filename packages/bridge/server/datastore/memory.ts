import type { DataStore, StoredMessage } from "./index"
import { DEFAULT_MESSAGE_TTL_MS } from "./sqlite"

interface Row {
  bridgeId: string
  timestamp: number
  message: string
  origin?: string
  expiresAt: number
}

/**
 * In-memory DataStore. Used by the acceptance test harness and handy as a
 * zero-dependency fallback. Not durable across restarts.
 */
export class MemoryDataStore implements DataStore {
  private readonly ttlMs: number
  private readonly messages: Row[] = []
  private readonly origins = new Map<string, string>()
  private seq = 0

  constructor(options: { ttlMs?: number } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_MESSAGE_TTL_MS
  }

  async saveMessage(bridgeId: string, timestamp: number, message: string, origin?: string): Promise<void> {
    this.messages.push({ bridgeId, timestamp, message, origin, expiresAt: timestamp + this.ttlMs })
    this.seq++
  }

  async getMessagesSince(bridgeId: string, since: number, limit: number): Promise<StoredMessage[]> {
    const now = Date.now()
    // Match SqliteDataStore: clamp to a non-negative integer for identical behaviour.
    const safeLimit = Math.max(0, Math.trunc(limit))
    return this.messages
      .filter((m) => m.bridgeId === bridgeId && m.timestamp > since && m.expiresAt > now)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, safeLimit)
      .map((m) => ({ message: m.message, origin: m.origin, timestamp: m.timestamp }))
  }

  async setBridgeOriginIfAbsent(bridgeId: string, origin: string): Promise<void> {
    if (!this.origins.has(bridgeId)) this.origins.set(bridgeId, origin)
  }

  async getBridgeOrigin(bridgeId: string): Promise<string | undefined> {
    return this.origins.get(bridgeId)
  }

  async pruneExpired(now: number): Promise<void> {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].expiresAt <= now) this.messages.splice(i, 1)
    }
  }

  async close(): Promise<void> {
    this.messages.length = 0
    this.origins.clear()
  }
}
