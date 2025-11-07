import { describe, beforeAll, afterAll, it, expect, setDefaultTimeout } from "bun:test"
import { CircuitManifest, PackagedCircuit, strip0x } from "@zkpassport/utils"
import path from "path"
import { RegistryClient } from "../src/client"
import { DocumentSupport, PackagedCertificatesFile } from "../src/types"
import {
  CERTIFICATE_FIXTURES_CID,
  CERTIFICATE_FIXTURES_ROOT,
  CERTIFICATE_GENESIS_ROOT,
  CERTIFICATE_REGISTRY_ID,
  CIRCUIT_GENESIS_ROOT,
  CIRCUIT_MANIFEST_FIXTURES_CID,
  CIRCUIT_MANIFEST_FIXTURES_ROOT,
  CIRCUIT_REGISTRY_ID,
  INVALID_HASH,
  NONEXISTENT_REGISTRY_ID,
  PACKAGED_CIRCUIT_FIXTURE_VKEY_HASH,
} from "./utils/constants"
import {
  AnvilInstance,
  CHAIN_ID,
  RPC_URL,
  isAnvilRunning,
  loadCircuitManifestFile,
  loadPackagedCertificatesFile,
  loadPackagedCircuitFile,
  startAnvil,
  stopAnvil,
} from "./utils/helpers"

let anvil: AnvilInstance
let registry: RegistryClient
let fixturePackagedCerts: PackagedCertificatesFile
let fixtureCircuitManifest: CircuitManifest
let fixturePackagedCircuit: PackagedCircuit

// Set default timeout for all tests to 30 seconds
setDefaultTimeout(30000)

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
    // Load packaged circuit fixture
    fixturePackagedCircuit = loadPackagedCircuitFile(
      path.resolve(__dirname, "fixtures", "circuit_compare_age.json"),
    )
  })
  let originalFetch: typeof fetch

  beforeAll(async () => {
    // Store original fetch
    originalFetch = globalThis.fetch
    // Create a mock fetch that returns the packaged certificates fixture
    const mockFetch = async (input: string | URL | Request, init?: RequestInit) => {
      const url: string = typeof input === "string" ? input : input.toString()
      // Return valid packaged certificates
      if (url.endsWith(`/certificates/${CERTIFICATE_FIXTURES_ROOT}.json`)) {
        return new Response(JSON.stringify(fixturePackagedCerts), { status: 200 })
      }
      // Return invalid packaged certificates
      else if (url.endsWith(`/certificates/${INVALID_HASH}.json`)) {
        return new Response(
          JSON.stringify({
            certificates: fixturePackagedCerts.certificates.slice(1),
            serialised: fixturePackagedCerts.serialised,
          }),
          { status: 200 },
        )
      }
      // Return valid circuit manifest
      else if (url.endsWith(`/by-root/${CIRCUIT_MANIFEST_FIXTURES_ROOT}/manifest.json`)) {
        return new Response(JSON.stringify(fixtureCircuitManifest), { status: 200 })
      }
      // Return invalid circuit manifest
      else if (url.endsWith(`/by-root/${INVALID_HASH}/manifest.json`)) {
        return new Response(
          JSON.stringify({
            version: fixtureCircuitManifest.version,
            root: fixtureCircuitManifest.root,
            // Remove the first entry
            circuits: Object.fromEntries(Object.entries(fixtureCircuitManifest.circuits).slice(1)),
          }),
          { status: 200 },
        )
      }
      // Return valid packaged circuit
      if (url.endsWith(`/by-hash/${PACKAGED_CIRCUIT_FIXTURE_VKEY_HASH}.json`)) {
        return new Response(JSON.stringify(fixturePackagedCircuit), { status: 200 })
      }
      // Return invalid packaged circuit
      else if (url.endsWith(`/by-hash/${INVALID_HASH}.json`)) {
        return new Response(
          JSON.stringify({
            ...fixturePackagedCircuit,
            circuit: fixturePackagedCircuit.vkey.substring(1),
          }),
          { status: 200 },
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
      const latestRoot = await registry.getLatestCertificateRoot()
      expect(latestRoot).toBe(CERTIFICATE_FIXTURES_ROOT)
    })

    it("should get latest certificates", async () => {
      const certificates = await registry.getCertificates()
      expect(certificates).toEqual(fixturePackagedCerts)
    })

    it("should fail to get certificates on invalid root hash", async () => {
      await expect(registry.getCertificates(INVALID_HASH)).rejects.toThrow(/validation failed/i)
    })

    it("should fetch certificates for a specific root", async () => {
      const packagedCerts = await registry.getCertificates(CERTIFICATE_FIXTURES_ROOT)
      expect(packagedCerts).toEqual(fixturePackagedCerts)
    })

    it("should validate certificates against a root hash", async () => {
      const latestRoot = await registry.getLatestCertificateRoot()
      expect(latestRoot).toBe(CERTIFICATE_FIXTURES_ROOT)
      const packagedCerts = await registry.getCertificates(latestRoot)
      const valid = await registry.validateCertificates(packagedCerts.certificates, latestRoot)
      expect(valid).toBe(true)
    })

    it("should not validate certificates against an invalid root hash", async () => {
      const latestRoot = await registry.getLatestCertificateRoot()
      expect(latestRoot).toBe(CERTIFICATE_FIXTURES_ROOT)
      const packagedCerts = await registry.getCertificates(latestRoot)
      const valid = await registry.validateCertificates(packagedCerts.certificates, INVALID_HASH)
      expect(valid).toBe(false)
    })

    it("should get historical roots with limit of 5", async () => {
      const historicalRoots = await registry.getHistoricalCertificateRoots(1, 5)
      expect(historicalRoots.roots.length).toBe(5)
      // Note: Index-based pagination _includes_ the record referenced
      expect(historicalRoots.roots[4].revoked).toBe(true)
      expect(historicalRoots.isLastPage).toBe(false)
    })

    it("should get last page of historical roots", async () => {
      const historicalRoots = await registry.getHistoricalCertificateRoots(7)
      expect(historicalRoots.roots.length).toBe(4)
      expect(historicalRoots.isLastPage).toBe(true)
    })

    it("should get all historical roots using pagination", async () => {
      const historicalRoots = await registry.getAllHistoricalCertificateRoots(4)
      expect(historicalRoots.length).toBe(10)

      const latest = historicalRoots[historicalRoots.length - 1]
      expect(latest.isLatest).toBe(true)
      expect(latest.root).toBe(CERTIFICATE_FIXTURES_ROOT)
      expect(latest.cid).toBe(CERTIFICATE_FIXTURES_CID)
    })

    it("should get latest certificate root details", async () => {
      const details = await registry.getCertificateRootDetails()
      expect(details.root).toBe(CERTIFICATE_FIXTURES_ROOT)
      expect(details.cid).toBe(CERTIFICATE_FIXTURES_CID)
      expect(details.leaves).toBe(5)
      expect(details.revoked).toBe(false)
      expect(details.index).toBe(10)
      expect(details.isLatest).toBe(true)
      expect(details.validTo).toBeUndefined()
    })

    it("should get specific certificate root details", async () => {
      const details = await registry.getCertificateRootDetails(CIRCUIT_GENESIS_ROOT)
      expect(details.root).toBe(CIRCUIT_GENESIS_ROOT)
      expect(details.leaves).toBe(100)
      expect(details.revoked).toBe(false)
      expect(details.index).toBe(1)
      expect(details.isLatest).toBe(false)
    })

    it("should get historical roots by hash with limit of 5", async () => {
      const historicalRoots = await registry.getHistoricalCertificateRoots(
        CERTIFICATE_GENESIS_ROOT,
        5,
      )
      // Note: Cursor-based pagination _excludes_ the record referenced
      expect(historicalRoots.roots[3].revoked).toBe(true)
      expect(historicalRoots.roots.length).toBe(5)
      expect(historicalRoots.isLastPage).toBe(false)
    })

    it("should check if a certificate root is valid", async () => {
      const valid = await registry.isCertificateRootValid(CERTIFICATE_FIXTURES_ROOT)
      expect(valid).toBe(true)
      const valid2 = await registry.isCertificateRootValid(strip0x(CERTIFICATE_FIXTURES_ROOT))
      expect(valid2).toBe(true)
    })

    it("should check if a certificate root is invalid", async () => {
      const valid = await registry.isCertificateRootValid(INVALID_HASH)
      expect(valid).toBe(false)
    })
  })

  describe("CircuitRegistry", () => {
    it("should get latest root", async () => {
      const latestRoot = await registry.getLatestCircuitRoot()
      expect(latestRoot).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
    })

    it("should get latest circuit manifest", async () => {
      const circuitManifest = await registry.getCircuitManifest()
      expect(circuitManifest).toEqual(fixtureCircuitManifest)
    })

    it("should fail to get circuit manifest on invalid root hash", async () => {
      await expect(registry.getCircuitManifest(INVALID_HASH)).rejects.toThrow(/validation failed/i)
    })

    it("should fetch circuit manifest for a specific root", async () => {
      const circuitManifest = await registry.getCircuitManifest(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      expect(circuitManifest).toEqual(fixtureCircuitManifest)
    })

    it("should validate circuit manifest against a root hash", async () => {
      const latestRoot = await registry.getLatestCircuitRoot()
      expect(latestRoot).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      const circuitManifest = await registry.getCircuitManifest(latestRoot)
      const valid = await registry.validateCircuitManifest(circuitManifest, latestRoot)
      expect(valid).toBe(true)
    })

    it("should not validate circuit manifest against an invalid root hash", async () => {
      const latestRoot = await registry.getLatestCircuitRoot()
      expect(latestRoot).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      const circuitManifest = await registry.getCircuitManifest(latestRoot)
      const valid = await registry.validateCircuitManifest(circuitManifest, INVALID_HASH)
      expect(valid).toBe(false)
    })

    it("should get historical roots with limit of 5", async () => {
      const historicalRoots = await registry.getHistoricalCircuitRoots(1, 5)
      expect(historicalRoots.roots.length).toBe(5)
      expect(historicalRoots.roots[4].revoked).toBe(true)
      expect(historicalRoots.isLastPage).toBe(false)
    })

    it("should get last page of historical roots", async () => {
      const historicalRoots = await registry.getHistoricalCircuitRoots(7)
      expect(historicalRoots.roots.length).toBe(4)
      expect(historicalRoots.isLastPage).toBe(true)
    })

    it("should get all historical roots using pagination", async () => {
      const historicalRoots = await registry.getAllHistoricalCircuitRoots(4)
      expect(historicalRoots.length).toBe(10)

      const latest = historicalRoots[historicalRoots.length - 1]
      expect(latest.isLatest).toBe(true)
      expect(latest.root).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      expect(latest.cid).toBe(CIRCUIT_MANIFEST_FIXTURES_CID)
    })

    it("should get latest circuit root details", async () => {
      const details = await registry.getCircuitRootDetails()
      expect(details.root).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      expect(details.cid).toBe(CIRCUIT_MANIFEST_FIXTURES_CID)
      expect(details.leaves).toBe(5)
      expect(details.revoked).toBe(false)
      expect(details.index).toBe(10)
      expect(details.isLatest).toBe(true)
      expect(details.validTo).toBeUndefined()
    })

    it("should get specific circuit root details", async () => {
      const details = await registry.getCircuitRootDetails(CIRCUIT_GENESIS_ROOT)
      expect(details.root).toBe(CIRCUIT_GENESIS_ROOT)
      expect(details.leaves).toBe(100)
      expect(details.revoked).toBe(false)
      expect(details.index).toBe(1)
      expect(details.isLatest).toBe(false)
    })

    it("should get latest circuit manifest", async () => {
      const manifest = await registry.getCircuitManifest()
      expect(manifest.root).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
    })

    it("should fail to get invalid circuit manifest", async () => {
      await expect(registry.getCircuitManifest(INVALID_HASH)).rejects.toThrow(/validation failed/i)
    })

    it("should get packaged circuit", async () => {
      const manifest = await registry.getCircuitManifest()
      expect(manifest.root).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      const circuit = await registry.getPackagedCircuit("compare_age", manifest, {
        validate: false,
      })
      expect(circuit.vkey_hash).toBe(PACKAGED_CIRCUIT_FIXTURE_VKEY_HASH)
    })

    it("should fail to get invalid packaged circuit", async () => {
      const manifest = await registry.getCircuitManifest()
      expect(manifest.root).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      manifest.circuits["compare_age"].hash = INVALID_HASH
      await expect(registry.getPackagedCircuit("compare_age", manifest)).rejects.toThrow(
        /validation failed/i,
      )
    })

    it("should fail to get unknown packaged circuit", async () => {
      const manifest = await registry.getCircuitManifest()
      expect(manifest.root).toBe(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      await expect(registry.getPackagedCircuit("unknown", manifest)).rejects.toThrow(/not found/i)
    })
  })

  describe("RootRegistry", () => {
    it("should get certificate registry address", async () => {
      const registryAddress1 = await registry.getRegistryAddress(CERTIFICATE_REGISTRY_ID)
      expect(registryAddress1).toBe("0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0")
      const registryAddress2 = await registry.getCertificateRegistryAddress()
      expect(registryAddress2).toBe("0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0")
    })

    it("should get circuit registry address", async () => {
      const registryAddress1 = await registry.getRegistryAddress(CIRCUIT_REGISTRY_ID)
      expect(registryAddress1).toBe("0xdc64a140aa3e981100a9beca4e685f962f0cf6c9")
      const registryAddress2 = await registry.getCircuitRegistryAddress()
      expect(registryAddress2).toBe("0xdc64a140aa3e981100a9beca4e685f962f0cf6c9")
    })

    it("should handle non-existent registry ID", async () => {
      await expect(registry.getRegistryAddress(NONEXISTENT_REGISTRY_ID)).rejects.toThrow(
        /doesn't exist/i,
      )
    })

    it("should handle invalid registry ID format", async () => {
      await expect(registry.getRegistryAddress("invalid")).rejects.toThrow(/invalid registry id/i)
    })

    it("should accept numeric registry ID", async () => {
      const registryId = parseInt(CERTIFICATE_REGISTRY_ID, 16)
      const registryAddress = await registry.getRegistryAddress(registryId)
      expect(registryAddress).toBe("0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0")
    })

    it("should check if a circuit root is valid", async () => {
      const valid = await registry.isCircuitRootValid(CIRCUIT_MANIFEST_FIXTURES_ROOT)
      expect(valid).toBe(true)
      const valid2 = await registry.isCircuitRootValid(strip0x(CIRCUIT_MANIFEST_FIXTURES_ROOT))
      expect(valid2).toBe(true)
    })

    it("should check if a circuit root is invalid", async () => {
      const valid = await registry.isCircuitRootValid(INVALID_HASH)
      expect(valid).toBe(false)
    })
  })

  describe("Document support", () => {
    it("should return the correct document support level for a given country and type", async () => {
      const today = new Date("2025-11-07")
      expect(await registry.isDocumentSupported("USA", today, "passport")).toBe(
        DocumentSupport.FULL_SUPPORT,
      )
      expect(await registry.isDocumentSupported("USA", today, "id_card")).toBe(
        DocumentSupport.NOT_SUPPORTED,
      )
      expect(await registry.isDocumentSupported("USA", today, "residence_permit")).toBe(
        DocumentSupport.NOT_SUPPORTED,
      )

      expect(await registry.isDocumentSupported("FRA", today, "passport")).toBe(
        DocumentSupport.FULL_SUPPORT,
      )
      expect(await registry.isDocumentSupported("FRA", today, "id_card")).toBe(
        DocumentSupport.PARTIAL_SUPPORT,
      )
      expect(await registry.isDocumentSupported("FRA", today, "residence_permit")).toBe(
        DocumentSupport.PARTIAL_SUPPORT,
      )

      expect(await registry.isDocumentSupported("IND", today, "passport")).toBe(
        DocumentSupport.TENTATIVE_SUPPORT,
      )
      expect(await registry.isDocumentSupported("IND", today, "id_card")).toBe(
        DocumentSupport.NOT_SUPPORTED,
      )
      expect(await registry.isDocumentSupported("IND", today, "residence_permit")).toBe(
        DocumentSupport.NOT_SUPPORTED,
      )

      expect(await registry.isDocumentSupported("IDN", today, "passport")).toBe(
        DocumentSupport.PARTIAL_SUPPORT,
      )
      expect(await registry.isDocumentSupported("IDN", today, "id_card")).toBe(
        DocumentSupport.NOT_SUPPORTED,
      )
      expect(await registry.isDocumentSupported("IDN", today, "residence_permit")).toBe(
        DocumentSupport.NOT_SUPPORTED,
      )
    })

    it("should return unsupported for passport if no valid certificate is found", async () => {
      // India only started issuing electronic passports in 2025, so there should be no valid certificate before that
      expect(await registry.isDocumentSupported("IND", new Date("2022-01-01"), "passport")).toBe(
        DocumentSupport.NOT_SUPPORTED,
      )

      // On the other hand, there should be a valid certificate for mid 2025
      expect(await registry.isDocumentSupported("IND", new Date("2025-06-01"), "passport")).toBe(
        DocumentSupport.TENTATIVE_SUPPORT,
      )
    })
  })
})
