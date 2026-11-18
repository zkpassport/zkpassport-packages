/**
 * Thrown when an RPC call gets no answer in time. A host blocked by a firewall often drops
 * packets instead of refusing the connection, so without a deadline the call waits forever.
 */
export class RegistryRequestTimeoutError extends Error {
  constructor(
    what: string,
    readonly url: string,
    readonly timeoutMs: number,
  ) {
    super(`Timed out after ${timeoutMs}ms getting ${what} from ${url}`)
    this.name = "RegistryRequestTimeoutError"
  }
}

/** Runs a request with a deadline, aborting the fetch where the platform supports it */
export function withTimeout<T>(
  request: (signal?: AbortSignal) => Promise<T>,
  { timeoutMs, url, what }: { timeoutMs: number; url: string; what: string },
): Promise<T> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RegistryRequestTimeoutError(what, url, timeoutMs))
      controller?.abort()
    }, timeoutMs)
  })
  return Promise.race([request(controller?.signal), timeout]).finally(() => clearTimeout(timer))
}
