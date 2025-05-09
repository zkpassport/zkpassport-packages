import { CircuitManifest } from "@zkpassport/utils"
import path from "path"
import { RegistryClient } from "../src/client"
import { PackagedCertificatesFile } from "../src/types"
import {
  CERTIFICATE_FIXTURES_ROOT,
  CIRCUIT_MANIFEST_FIXTURES_ROOT,
  INVALID_ROOT_HASH,
} from "./utils/constants"
import {
  AnvilInstance,
  CHAIN_ID,
  RPC_URL,
  isAnvilRunning,
  loadCircuitManifestFile,
  loadPackagedCertificatesFile,
  startAnvil,
  stopAnvil,
} from "./utils/helpers"

let anvil: AnvilInstance
let registry: RegistryClient
let fixturePackagedCerts: PackagedCertificatesFile
let fixtureCircuitManifest: CircuitManifest

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
    // Load circuit manifest fixture
    fixtureCircuitManifest = loadCircuitManifestFile(
      path.resolve(__dirname, "fixtures", "manifest.json"),
    )
  })
  let originalFetch: typeof fetch

  beforeAll(async () => {
    // Store original fetch
    originalFetch = globalThis.fetch
    // Create a mock fetch that returns the packaged certificates fixture
    const mockFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url: string = typeof input === "string" ? input : input.toString()
      // Return the valid packaged certificates
      if (url.endsWith(`/certificates/${CERTIFICATE_FIXTURES_ROOT}.json`)) {
        return new Response(JSON.stringify(fixturePackagedCerts), {
          status: 200,
        })
      }
      // Return invalid packaged certificates
      else if (url.endsWith(`/certificates/${INVALID_ROOT_HASH}.json`)) {
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
      // Return valid circuit manifest
      else if (url.endsWith(`/circuits/${CIRCUIT_MANIFEST_FIXTURES_ROOT}.json`)) {
        return new Response(JSON.stringify(fixtureCircuitManifest), {
          status: 200,
        })
      }
      // Return invalid circuit manifest
      else if (url.endsWith(`/circuits/${INVALID_ROOT_HASH}.json`)) {
        return new Response(
          JSON.stringify({
            version: fixtureCircuitManifest.version,
            root: fixtureCircuitManifest.root,
            // Remove the first entry
            circuits: Object.fromEntries(Object.entries(fixtureCircuitManifest.circuits).slice(1)),
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

  afterAll(async () => {
    // Restore original fetch
    globalThis.fetch = originalFetch
    await stopAnvil(anvil)
  })

  it("should connect to the Anvil node", async () => {
    const isRunning = await isAnvilRunning()
    expect(isRunning).toBe(true)
  })

  describe("CertificateRegistry", () => {
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

  describe("CircuitRegistry", () => {
    it("should get latest root", async () => {
      const latestRoot = await registry.getCircuitsRoot()
      expect(latestRoot).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
    })

    it("should get latest circuit manifest", async () => {
      const circuitManifest = await registry.getCircuitManifest()
      expect(circuitManifest).toEqual(fixtureCircuitManifest)
    })

    it("should fail to get circuit manifest on invalid root hash", async () => {
      await expect(registry.getCircuitManifest(INVALID_ROOT_HASH)).rejects.toThrow(
        /validation failed/i,
      )
    })

    it("should fetch circuit manifest for a specific root", async () => {
      const circuitManifest = await registry.getCircuitManifest(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      expect(circuitManifest).toEqual(fixtureCircuitManifest)
    })

    it("should validate circuit manifest against a root hash", async () => {
      const latestRoot = await registry.getCircuitsRoot()
      expect(latestRoot).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      const circuitManifest = await registry.getCircuitManifest(latestRoot)
      const valid = await registry.validateCircuitManifest(circuitManifest, latestRoot)
      expect(valid).toBe(true)
    })

    it("should not validate circuit manifest against an invalid root hash", async () => {
      const latestRoot = await registry.getCircuitsRoot()
      expect(latestRoot).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      const circuitManifest = await registry.getCircuitManifest(latestRoot)
      const valid = await registry.validateCircuitManifest(circuitManifest, INVALID_ROOT_HASH)
      expect(valid).toBe(false)
    })

    it("should get historical roots with limit of 5", async () => {
      const historicalRoots = await registry.getHistoricalCircuitRegistryRoots(1, 5)
      expect(historicalRoots.roots.length).toBe(5)
      expect(historicalRoots.roots[4].revoked).toBe(true)
      expect(historicalRoots.isLastPage).toBe(false)
    })

    it("should get last page of historical roots", async () => {
      const historicalRoots = await registry.getHistoricalCircuitRegistryRoots(7)
      expect(historicalRoots.roots.length).toBe(4)
      expect(historicalRoots.isLastPage).toBe(true)
    })

    it("should get all historical roots using pagination", async () => {
      const historicalRoots = await registry.getAllHistoricalCircuitRegistryRoots(4)
      expect(historicalRoots.length).toBe(10)

      const latest = historicalRoots[historicalRoots.length - 1]
      expect(latest.isLatest).toBe(true)
      expect(latest.root).toBe("0x2e69be09971588016807c5b4f8596c0994fafd5171a096dc9df3ebeadf5b235a")
      expect(latest.cid).toBe("bafybeicv6elm7ngss565rzmdn7k4336k3s7zmr4cxhhra74pii7dbagwbe")
    })

    it("should get latest historical root", async () => {
      const latest = await registry.getLatestCircuitsRootDetails()
      expect(latest.root).toBe("0x2e69be09971588016807c5b4f8596c0994fafd5171a096dc9df3ebeadf5b235a")
      expect(latest.cid).toBe("bafybeicv6elm7ngss565rzmdn7k4336k3s7zmr4cxhhra74pii7dbagwbe")
      expect(latest.leaves).toBe(5)
      expect(latest.revoked).toBe(false)
      expect(latest.index).toBe(10)
      expect(latest.isLatest).toBe(true)
      expect(latest.validTo).toBeUndefined()
    })
  })
})
