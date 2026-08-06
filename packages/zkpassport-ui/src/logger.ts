// Console logger with a standard prefix, recognizable in the host page's console

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
