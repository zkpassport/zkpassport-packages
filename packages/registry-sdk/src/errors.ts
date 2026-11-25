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

/**
 * An RPC endpoint failed a request in a way another endpoint might not, so the request moves to the next endpoint
 */
export class RpcEndpointError extends Error {
  /**
   * @param message - What the endpoint got wrong
   * @param response - The endpoint's HTTP response, when it answered with an error status
   */
  constructor(
    message: string,
    readonly response?: Response,
  ) {
    super(message)
    this.name = "RpcEndpointError"
  }
}

/**
 * Posts JSON-RPC bodies to one RPC endpoint. Each call of `read` is given a `post` for one endpoint, so all the requests
 * of one read reach the same endpoint, and the read moves whole to the next endpoint when that one fails.
 */
export type RpcEndpointSession = <T>(
  read: (post: (body: string) => Promise<Response>) => Promise<T>,
) => Promise<T>

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
