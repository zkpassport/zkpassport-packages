/**
 * Thrown when a registry request gets no complete answer in time. A host that a firewall
 * blocks often drops packets instead of refusing the connection, so without a deadline the
 * request would wait forever.
 */
export class RegistryRequestTimeoutError extends Error {
  readonly url: string
  readonly timeoutMs: number

  constructor(what: string, url: string, timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms getting ${what} from ${url}`)
    this.name = "RegistryRequestTimeoutError"
    this.url = url
    this.timeoutMs = timeoutMs
  }
}

/**
 * Runs a request with a deadline. The abort signal stops the underlying fetch where the
 * platform supports it, and the race rejects even where it does not.
 */
export function withTimeout<T>(
  operation: (signal?: AbortSignal) => Promise<T>,
  { timeoutMs, url, what }: { timeoutMs: number; url: string; what: string },
): Promise<T> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new RegistryRequestTimeoutError(what, url, timeoutMs))
      controller?.abort()
    }, timeoutMs)
    operation(controller?.signal).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
