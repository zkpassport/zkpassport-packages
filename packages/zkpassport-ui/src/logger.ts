/**
 * Tiny console logger with a standard prefix so anything the widget emits is
 * recognizable in the host page's console. Debug output is off by default;
 * enable it with `localStorage.setItem("zkpassport:debug", "1")`.
 */

const PREFIX = "[zkpassport]"

function isDebugEnabled(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("zkpassport:debug") === "1"
  } catch {
    return false
  }
}

export const logger = {
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args)
  },
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args)
  },
  info(...args: unknown[]): void {
    console.info(PREFIX, ...args)
  },
  debug(...args: unknown[]): void {
    if (isDebugEnabled()) console.debug(PREFIX, ...args)
  },
}
