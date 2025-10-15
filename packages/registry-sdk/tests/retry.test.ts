import { RegistryClient } from "../src/client"
import type { PackagedCertificatesFile } from "../src/types"

describe("Retry Logic", () => {
  let attemptCount: number
  let originalFetch: typeof globalThis.fetch
  let registry: RegistryClient
  const MOCK_ROOT = "0x1234567890123456789012345678901234567890123456789012345678901234"
  const MOCK_RPC_URL = "https://mock-rpc.example.com"

  const mockPackagedCerts: PackagedCertificatesFile = {
    certificates: [
      {
        country: "USA",
        validity: {
          not_before: 1000000,
          not_after: 2000000,
        },
        type: "TD1",
        subject_key_identifier: "0xabc",
        authority_key_identifier: "0xabc",
        public_key: {
          type: "RSA",
          modulus: "0xabc",
          exponent: 65537,
          key_size: 4096,
        },
        signature_algorithm: "RSA",
        hash_algorithm: "SHA-256",
      },
    ],
    serialised: [],
  }

  beforeEach(() => {
    attemptCount = 0
    originalFetch = globalThis.fetch
    registry = new RegistryClient({
      chainId: 31337,
      rpcUrl: MOCK_RPC_URL,
      rootRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      registryHelper: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      retryCount: 3,
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("Network Errors", () => {
    it("should retry on TypeError (network error) and succeed", async () => {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = input.toString()
        attemptCount++

        // Fail first 2 attempts with network error
        if (attemptCount <= 2) {
          throw new TypeError("Network request failed")
        }

        // Succeed on 3rd attempt
        if (url.includes("/certificates/")) {
          return new Response(JSON.stringify(mockPackagedCerts), { status: 200 })
        }
        if (url.includes(MOCK_RPC_URL)) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: MOCK_ROOT,
            }),
            { status: 200 },
          )
        }
        return new Response("Not found", { status: 404 })
      }

      const certs = await registry.getCertificates(MOCK_ROOT, { validate: false })
      expect(attemptCount).toBe(3)
      expect(certs.certificates).toHaveLength(1)
    })

    it("should fail after exhausting all retries", async () => {
      globalThis.fetch = async () => {
        attemptCount++
        throw new TypeError("Network request failed")
      }

      await expect(registry.getCertificates(MOCK_ROOT, { validate: false })).rejects.toThrow(
        "Network request failed",
      )
      expect(attemptCount).toBe(4) // Initial attempt + 3 retries
    })
  })

  describe("Exponential Backoff", () => {
    it("should use exponential backoff delays", async () => {
      const delays: number[] = []
      let lastTime = Date.now()

      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = input.toString()
        const currentTime = Date.now()

        if (attemptCount > 0) {
          delays.push(currentTime - lastTime)
        }

        lastTime = currentTime
        attemptCount++

        if (attemptCount <= 3) {
          throw new TypeError("Network error")
        }

        if (url.includes("/certificates/")) {
          return new Response(JSON.stringify(mockPackagedCerts), { status: 200 })
        }
        return new Response("OK", { status: 200 })
      }

      await registry.getCertificates(MOCK_ROOT, { validate: false })

      // Verify exponential backoff: ~100ms, ~200ms, ~400ms
      expect(delays).toHaveLength(3)
      // First delay should be around 100ms (with some tolerance)
      expect(delays[0]).toBeGreaterThanOrEqual(95)
      expect(delays[0]).toBeLessThan(150)
      // Second delay should be around 200ms
      expect(delays[1]).toBeGreaterThanOrEqual(190)
      expect(delays[1]).toBeLessThan(250)
      // Third delay should be around 400ms
      expect(delays[2]).toBeGreaterThanOrEqual(390)
      expect(delays[2]).toBeLessThan(500)
    })
  })

  describe("Custom Retry Count", () => {
    it("should respect retryCount of 1", async () => {
      const registrySingleRetry = new RegistryClient({
        chainId: 31337,
        rpcUrl: MOCK_RPC_URL,
        rootRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        registryHelper: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        retryCount: 1,
      })

      globalThis.fetch = async () => {
        attemptCount++
        throw new TypeError("Network error")
      }

      await expect(
        registrySingleRetry.getCertificates(MOCK_ROOT, { validate: false }),
      ).rejects.toThrow("Network error")
      expect(attemptCount).toBe(2) // Initial attempt + 1 retry
    })

    it("should respect retryCount of 5", async () => {
      const registryManyRetries = new RegistryClient({
        chainId: 31337,
        rpcUrl: MOCK_RPC_URL,
        rootRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
        registryHelper: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
        retryCount: 5,
      })

      globalThis.fetch = async () => {
        attemptCount++
        throw new TypeError("Network error")
      }

      await expect(
        registryManyRetries.getCertificates(MOCK_ROOT, { validate: false }),
      ).rejects.toThrow()
      expect(attemptCount).toBe(6) // Initial attempt + 5 retries
    })
  })

  describe("RPC Request Retries", () => {
    it("should retry RPC requests on network errors", async () => {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = input.toString()
        attemptCount++

        if (url.includes(MOCK_RPC_URL)) {
          if (attemptCount <= 2) {
            throw new TypeError("Network error")
          }
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: MOCK_ROOT,
            }),
            { status: 200 },
          )
        }
        return new Response("OK", { status: 200 })
      }

      const root = await registry.getLatestCertificateRoot()
      expect(attemptCount).toBe(3)
      expect(root).toBe(MOCK_ROOT)
    })
  })

  describe("Circuit Manifest Retries", () => {
    it("should retry when fetching circuit manifest on network errors", async () => {
      const mockManifest = {
        version: "1.0.0",
        root: MOCK_ROOT,
        circuits: {
          test_circuit: {
            hash: "0xdef",
            name: "test_circuit",
          },
        },
      }

      globalThis.fetch = async (input: RequestInfo | URL) => {
        const url = input.toString()
        attemptCount++

        // Mock RPC calls
        if (url.includes(MOCK_RPC_URL)) {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: MOCK_ROOT,
            }),
            { status: 200 },
          )
        }

        // Mock circuit manifest fetch with retries
        if (url.includes("/manifest.json")) {
          if (attemptCount <= 2) {
            throw new TypeError("Network error")
          }
          return new Response(JSON.stringify(mockManifest), { status: 200 })
        }

        return new Response("Not Found", { status: 404 })
      }

      const manifest = await registry.getCircuitManifest(MOCK_ROOT, { validate: false })
      expect(attemptCount).toBeGreaterThanOrEqual(3)
      expect(manifest.version).toBe("1.0.0")
    })
  })
})
