/**
 * Per-IP rate limiting with hourly + monthly limits for connections and
 * messages. In-memory and process-local (swap the class for a shared backend if
 * you run multiple instances).
 *
 * Defaults are high enough never to interfere with normal usage or the test
 * suite. Set `enabled: false` to disable.
 */

export type RateLimitAction = "connect" | "message"

export interface RateLimitConfig {
  enabled: boolean
  maxConnectionsPerHour: number
  maxConnectionsPerMonth: number
  maxMessagesPerHour: number
  maxMessagesPerMonth: number
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  enabled: true,
  maxConnectionsPerHour: 1000,
  maxConnectionsPerMonth: 30000,
  maxMessagesPerHour: 1000,
  maxMessagesPerMonth: 50000,
}

export interface RateLimiter {
  /** Returns true if the action is allowed (and counts it); false if over limit. */
  allow(ip: string, action: RateLimitAction): boolean
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly cfg: RateLimitConfig
  private readonly counters = new Map<string, number>()
  private lastPrune = 0

  constructor(cfg: Partial<RateLimitConfig> = {}) {
    this.cfg = { ...DEFAULT_RATE_LIMITS, ...cfg }
  }

  allow(ip: string, action: RateLimitAction): boolean {
    if (!this.cfg.enabled) return true

    const now = Date.now()
    this.maybePrune(now)

    const hourEpoch = Math.floor(now / 3_600_000)
    const monthEpoch = new Date(now).toISOString().slice(0, 7) // YYYY-MM
    const hourLimit =
      action === "connect" ? this.cfg.maxConnectionsPerHour : this.cfg.maxMessagesPerHour
    const monthLimit =
      action === "connect" ? this.cfg.maxConnectionsPerMonth : this.cfg.maxMessagesPerMonth

    const hourKey = `${action}#hour#${hourEpoch}#${ip}`
    const monthKey = `${action}#month#${monthEpoch}#${ip}`

    const hourCount = (this.counters.get(hourKey) ?? 0) + 1
    const monthCount = (this.counters.get(monthKey) ?? 0) + 1

    if (hourCount > hourLimit || monthCount > monthLimit) return false

    this.counters.set(hourKey, hourCount)
    this.counters.set(monthKey, monthCount)
    return true
  }

  /** Drop stale hourly and monthly buckets so the map doesn't grow unbounded. */
  private maybePrune(now: number): void {
    if (now - this.lastPrune < 3_600_000) return
    this.lastPrune = now
    const currentHour = Math.floor(now / 3_600_000)
    const currentMonth = new Date(now).toISOString().slice(0, 7)
    for (const key of this.counters.keys()) {
      const hour = key.match(/#hour#(\d+)#/)
      if (hour && Number(hour[1]) < currentHour) {
        this.counters.delete(key)
        continue
      }
      const month = key.match(/#month#(\d{4}-\d{2})#/)
      if (month && month[1] < currentMonth) this.counters.delete(key)
    }
  }
}
