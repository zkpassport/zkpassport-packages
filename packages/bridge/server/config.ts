import { DEFAULT_MESSAGE_TTL_MS } from "./datastore/sqlite"
import { DEFAULT_RATE_LIMITS, type RateLimitConfig } from "./ratelimit"

export interface ServerConfig {
  /** TCP port to listen on. */
  port: number
  /** Hostname/interface to bind. */
  hostname: string
  /** SQLite database path, or ":memory:". */
  dbPath: string
  /** Message retention in milliseconds (replay window). */
  messageTtlMs: number
  /** How many messages a single replay request may return. */
  replayLimit: number
  /** How often to prune expired messages, in milliseconds. */
  pruneIntervalMs: number
  /**
   * Trust the `X-Forwarded-For` header for the client IP (rate limiting).
   * Enable ONLY when behind a trusted reverse proxy / load balancer that sets
   * it — otherwise clients could spoof their IP. When off, the socket peer
   * address is used. Default off.
   */
  trustProxy: boolean
  /** Rate limiting configuration. */
  rateLimit: RateLimitConfig
}

function num(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback
  return !["0", "false", "no", "off"].includes(value.toLowerCase())
}

/** Build a config from environment variables, falling back to sane defaults. */
export function configFromEnv(env: Record<string, string | undefined> = process.env): ServerConfig {
  return {
    port: num(env.PORT, 8080),
    hostname: env.HOST ?? "0.0.0.0",
    dbPath: env.DB_PATH ?? "bridge.sqlite",
    messageTtlMs: num(env.MESSAGE_TTL_MS, DEFAULT_MESSAGE_TTL_MS),
    // Always a non-negative integer (a float would break the SQLite LIMIT bind).
    replayLimit: Math.max(0, Math.trunc(num(env.REPLAY_LIMIT, 100))),
    pruneIntervalMs: num(env.PRUNE_INTERVAL_MS, 60 * 60 * 1000),
    trustProxy: bool(env.TRUST_PROXY, false),
    rateLimit: {
      enabled: bool(env.RATE_LIMIT_ENABLED, DEFAULT_RATE_LIMITS.enabled),
      maxConnectionsPerHour: num(env.MAX_CONNECTIONS_PER_HOUR, DEFAULT_RATE_LIMITS.maxConnectionsPerHour),
      maxConnectionsPerMonth: num(env.MAX_CONNECTIONS_PER_MONTH, DEFAULT_RATE_LIMITS.maxConnectionsPerMonth),
      maxMessagesPerHour: num(env.MAX_MESSAGES_PER_HOUR, DEFAULT_RATE_LIMITS.maxMessagesPerHour),
      maxMessagesPerMonth: num(env.MAX_MESSAGES_PER_MONTH, DEFAULT_RATE_LIMITS.maxMessagesPerMonth),
    },
  }
}
