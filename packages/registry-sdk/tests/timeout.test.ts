import { createRegistryClient, RegistryClient, RegistryRequestTimeoutError } from "../src"

const MOCK_ROOT = "0x1234567890123456789012345678901234567890123456789012345678901234"
const PRIMARY_RPC = "https://primary-rpc.example.com"
const FALLBACK_RPC = "https://fallback-rpc.example.com"

const rpcResponse = (result: string) =>
  new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), { status: 200 })

/** A fetch that never answers, like a host blocked by a firewall that drops packets */
const hangingFetch = (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))
  })

const newClient = (overrides: Record<string, unknown> = {}) =>
  new RegistryClient({
    chainId: 31337,
    rpcUrl: PRIMARY_RPC,
    rootRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    registryHelper: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    retryCount: 1,
    rpcTimeoutMs: 50,
    fallbackRpcTimeoutMs: 50,
    downloadTimeoutMs: 50,
    ...overrides,
  })

describe("Request timeouts", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("rejects a hung RPC call with a timeout error", async () => {
    globalThis.fetch = hangingFetch as typeof fetch

    const error = await newClient()
      .getLatestCertificateRoot()
      .catch((e) => e)

    expect(error).toBeInstanceOf(RegistryRequestTimeoutError)
    expect(error.url).toBe(PRIMARY_RPC)
  })

  it("rejects a hung download with a timeout error", async () => {
    globalThis.fetch = hangingFetch as typeof fetch

    const error = await newClient()
      .getCertificates(MOCK_ROOT, { validate: false })
      .catch((e) => e)

    expect(error).toBeInstanceOf(RegistryRequestTimeoutError)
    expect(error.url).toContain(MOCK_ROOT)
  })

  it("lets a download that has started take longer than the deadline", async () => {
    const certificates = { version: 1, certificates: [], certificates_serialised: [] }
    globalThis.fetch = (async () => {
      const response = new Response(JSON.stringify(certificates), { status: 200 })
      const json = response.json.bind(response)
      response.json = async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return json()
      }
      return response
    }) as unknown as typeof fetch

    const data = await newClient().getCertificates(MOCK_ROOT, { validate: false })

    expect(data.certificates).toEqual([])
  })

  it("times out even when fetch ignores the abort signal", async () => {
    globalThis.fetch = (() => new Promise<Response>(() => {})) as unknown as typeof fetch

    const error = await newClient()
      .getLatestCertificateRoot()
      .catch((e) => e)

    expect(error).toBeInstanceOf(RegistryRequestTimeoutError)
  })
})

describe("Fallback RPC URLs", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("uses the next RPC URL when the first one hangs", async () => {
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      input.toString() === PRIMARY_RPC
        ? hangingFetch(input, init)
        : Promise.resolve(rpcResponse(MOCK_ROOT))) as typeof fetch

    const root = await newClient({ fallbackRpcUrls: [FALLBACK_RPC] }).getLatestCertificateRoot()

    expect(root).toBe(MOCK_ROOT)
  })

  it("gives a fallback RPC URL longer than the first one", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input.toString() === PRIMARY_RPC) return hangingFetch(input, init)
      await new Promise((resolve) => setTimeout(resolve, 150))
      return rpcResponse(MOCK_ROOT)
    }) as typeof fetch

    const root = await newClient({
      rpcTimeoutMs: 50,
      fallbackRpcTimeoutMs: 1000,
      fallbackRpcUrls: [FALLBACK_RPC],
    }).getLatestCertificateRoot()

    expect(root).toBe(MOCK_ROOT)
  })

  it("uses the next RPC URL when the first one answers with a server error", async () => {
    globalThis.fetch = ((input: RequestInfo | URL) =>
      Promise.resolve(
        input.toString() === PRIMARY_RPC
          ? new Response("Forbidden", { status: 403, statusText: "Forbidden" })
          : rpcResponse(MOCK_ROOT),
      )) as typeof fetch

    const root = await newClient({ fallbackRpcUrls: [FALLBACK_RPC] }).getLatestCertificateRoot()

    expect(root).toBe(MOCK_ROOT)
  })

  it("reports the last failure when every RPC URL fails", async () => {
    globalThis.fetch = hangingFetch as typeof fetch

    const error = await newClient({ fallbackRpcUrls: [FALLBACK_RPC] })
      .getLatestCertificateRoot()
      .catch((e) => e)

    expect(error).toBeInstanceOf(RegistryRequestTimeoutError)
    expect(error.url).toBe(FALLBACK_RPC)
  })
})

describe("Failover between RPC URLs", () => {
  let originalFetch: typeof globalThis.fetch
  let calls: string[]

  beforeEach(() => {
    originalFetch = globalThis.fetch
    calls = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  const primaryHangs = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(input.toString())
    return input.toString() === PRIMARY_RPC
      ? hangingFetch(input, init)
      : Promise.resolve(rpcResponse(MOCK_ROOT))
  }) as typeof fetch

  it("moves on after one timeout instead of retrying a blocked URL", async () => {
    globalThis.fetch = primaryHangs

    await newClient({ retryCount: 3, fallbackRpcUrls: [FALLBACK_RPC] }).getLatestCertificateRoot()

    expect(calls).toEqual([PRIMARY_RPC, FALLBACK_RPC])
  })

  it("starts with the URL that last worked", async () => {
    globalThis.fetch = primaryHangs
    const client = newClient({ fallbackRpcUrls: [FALLBACK_RPC] })

    await client.getLatestCertificateRoot()
    await client.getLatestCircuitRoot()

    expect(calls).toEqual([PRIMARY_RPC, FALLBACK_RPC, FALLBACK_RPC])
  })

  it("falls back to ZKPassport's RPC route for a chain it knows", async () => {
    const sepoliaFallback = "https://api.zkpassport.id/api/rpc/ethereum_sepolia"
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(input.toString())
      return input.toString() === sepoliaFallback
        ? Promise.resolve(rpcResponse(MOCK_ROOT))
        : hangingFetch(input, init)
    }) as typeof fetch

    const root = await createRegistryClient("ethereum_sepolia", {
      rpcTimeoutMs: 50,
    }).getLatestCertificateRoot()

    expect(root).toBe(MOCK_ROOT)
    expect(calls[calls.length - 1]).toBe(sepoliaFallback)
  })
})
