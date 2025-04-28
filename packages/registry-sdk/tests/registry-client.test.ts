import path from "path"
import { RegistryClient } from "../src/client"
import { PackagedCertificatesFile } from "../src/types"
import { CERTIFICATE_FIXTURES_ROOT, INVALID_ROOT_HASH } from "./utils/constants"
import {
  AnvilInstance,
  CHAIN_ID,
  RPC_URL,
  isAnvilRunning,
  loadPackagedCertificatesFile,
  startAnvil,
  stopAnvil,
} from "./utils/helpers"

let anvil: AnvilInstance
let registry: RegistryClient
let fixturePackagedCerts: PackagedCertificatesFile

describe("Registry", () => {
  beforeAll(async () => {
    // Start Anvil and deploy contracts
    anvil = await startAnvil()
    // Initialize the registry client
    registry = new RegistryClient({
      chainId: CHAIN_ID,
      rpcUrl: RPC_URL,
      rootRegistry: anvil.rootRegistry,
      registryHelper: anvil.registryHelper,
    })
    // Load packaged certificates fixture
    fixturePackagedCerts = loadPackagedCertificatesFile(
      path.resolve(__dirname, "fixtures", "certificates.json"),
    )
  })

  afterAll(async () => {
    await stopAnvil(anvil)
  })

  it("should connect to the Anvil node", async () => {
    const isRunning = await isAnvilRunning()
    expect(isRunning).toBe(true)
  })

  describe("CertificateRegistry", () => {
    let originalFetch: typeof fetch

    beforeAll(async () => {
      // Store original fetch
      originalFetch = globalThis.fetch
      // Create a mock fetch that returns the packaged certificates fixture
      const mockFetch = async (input: string | URL | Request, init?: RequestInit) => {
        const url: string = typeof input === "string" ? input : input.toString()
        // Return the certificates fixture for the valid root hash
        if (url.endsWith(`/${CERTIFICATE_FIXTURES_ROOT}.json`)) {
          return new Response(JSON.stringify(fixturePackagedCerts), {
            status: 200,
          })
        }
        // Only return the first certificate for the invalid root hash
        else if (url.endsWith(`/${INVALID_ROOT_HASH}.json`)) {
          return new Response(
            JSON.stringify({
              certificates: fixturePackagedCerts.certificates.slice(1),
              serialised: fixturePackagedCerts.serialised,
            }),
            {
              status: 200,
            },
          )
        }
        // Pass through to the original fetch
        else {
          return originalFetch(input, init)
        }
      }
      mockFetch.preconnect = originalFetch.preconnect
      globalThis.fetch = mockFetch
    })

    afterAll(() => {
      // Restore original fetch
      globalThis.fetch = originalFetch
    })

    it("should get latest root", async () => {
      const latestRoot = await registry.getCertificatesRoot()
      expect(latestRoot).toBe(CERTIFICATE_FIXTURES_ROOT)
    })

    it("should get latest certificates", async () => {
      const certificates = await registry.getCertificates()
      expect(certificates).toEqual(fixturePackagedCerts)
    })

    it("should fail to get certificates on invalid root hash", async () => {
      await expect(registry.getCertificates(INVALID_ROOT_HASH)).rejects.toThrow(
        /validation failed/i,
      )
    })

    it("should fetch certificates for a specific root", async () => {
      const packagedCerts = await registry.getCertificates(CERTIFICATE_FIXTURES_ROOT)
      expect(packagedCerts).toEqual(fixturePackagedCerts)
    })

    it("should validate certificates against a root hash", async () => {
      const latestRoot = await registry.getCertificatesRoot()
      expect(latestRoot).toBe(CERTIFICATE_FIXTURES_ROOT)
      const packagedCerts = await registry.getCertificates(latestRoot)
      const valid = await registry.validateCertificates(packagedCerts.certificates, latestRoot)
      expect(valid).toBe(true)
    })

    it("should not validate certificates against an invalid root hash", async () => {
      const latestRoot = await registry.getCertificatesRoot()
      expect(latestRoot).toBe(CERTIFICATE_FIXTURES_ROOT)
      const packagedCerts = await registry.getCertificates(latestRoot)
      const valid = await registry.validateCertificates(
        packagedCerts.certificates,
        INVALID_ROOT_HASH,
      )
      expect(valid).toBe(false)
    })

    it("should get historical roots with limit of 5", async () => {
      const historicalRoots = await registry.getHistoricalCertificateRegistryRoots(1, 5)
      expect(historicalRoots.roots.length).toBe(5)
      expect(historicalRoots.roots[4].revoked).toBe(true)
      expect(historicalRoots.isLastPage).toBe(false)
    })

    it("should get last page of historical roots", async () => {
      const historicalRoots = await registry.getHistoricalCertificateRegistryRoots(7)
      expect(historicalRoots.roots.length).toBe(4)
      expect(historicalRoots.isLastPage).toBe(true)
    })

    it("should get all historical roots using pagination", async () => {
      const historicalRoots = await registry.getAllHistoricalCertificateRegistryRoots(4)
      expect(historicalRoots.length).toBe(10)

      const latest = historicalRoots[historicalRoots.length - 1]
      expect(latest.isLatest).toBe(true)
      expect(latest.root).toBe("0x15db8c75a3eb23f2d87ad299a8a4263cdb630e59be154b8db9864911db507681")
      expect(latest.cid).toBe("bafybeih2nqzzw4p3akbq5jj3iqdod6mrdtyjklpoogu3cmoh2bhrssgffi")
    })

    it("should get latest historical root", async () => {
      const latest = await registry.getLatestCertificatesRootDetails()
      expect(latest.root).toBe("0x15db8c75a3eb23f2d87ad299a8a4263cdb630e59be154b8db9864911db507681")
      expect(latest.cid).toBe("bafybeih2nqzzw4p3akbq5jj3iqdod6mrdtyjklpoogu3cmoh2bhrssgffi")
      expect(latest.leaves).toBe(5)
      expect(latest.revoked).toBe(false)
      expect(latest.index).toBe(10)
      expect(latest.isLatest).toBe(true)
      expect(latest.validTo).toBeUndefined()
    })
  })
})
