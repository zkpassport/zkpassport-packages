import { startServer } from "./server"
import { configFromEnv } from "./config"

/**
 * CLI entry point. Configure via environment variables (see server/config.ts):
 *   PORT, HOST, DB_PATH, MESSAGE_TTL_MS, REPLAY_LIMIT, PRUNE_INTERVAL_MS,
 *   RATE_LIMIT_ENABLED, MAX_CONNECTIONS_PER_HOUR, MAX_MESSAGES_PER_HOUR, ...
 *
 * Enable verbose logging with DEBUG=bridge:server (or DEBUG=bridge:*).
 */
const config = configFromEnv()
const handle = startServer()

console.log(`🌉 bridge listening on ws://${config.hostname}:${handle.port}`)
console.log(`   db=${config.dbPath} rateLimit=${config.rateLimit.enabled ? "on" : "off"}`)

const shutdown = async (signal: string) => {
  console.log(`\nReceived ${signal}, shutting down...`)
  await handle.stop()
  process.exit(0)
}
process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
