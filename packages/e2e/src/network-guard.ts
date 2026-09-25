/**
 * Make fetch() reach only this machine, and record every other URL something tried to fetch.
 * It covers fetch only: child processes and libraries using their own HTTP stack (e.g. bb.js
 * downloading its CRS) are not intercepted.
 */
export function guardNetwork(): { blocked: string[]; restore: () => void } {
  const blocked: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (["127.0.0.1", "localhost"].includes(new URL(url).hostname)) return realFetch(input, init)
    blocked.push(url)
    throw new Error(`e2e network guard: blocked ${url}`)
  }) as typeof fetch
  return { blocked, restore: () => (globalThis.fetch = realFetch) }
}
