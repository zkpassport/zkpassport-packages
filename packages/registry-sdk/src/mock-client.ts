import type { CircuitManifest, PackagedCircuit } from "@zkpassport/utils"
import { RegistryClient } from "./client"
import type { RegistryClientOptions } from "./types"

/**
 * MockRegistryClient that extends RegistryClient, overriding only the circuit
 * artifact methods to fetch from a local HTTP server.
 * Warning: This is only meant for development purposes.
 */
export class MockRegistryClient extends RegistryClient {
  private readonly mockBaseUrl: string

  constructor(options: Partial<RegistryClientOptions> & { baseUrl?: string } = {}) {
    super({ chainId: 11155111, ...options })
    const envMockRegistryUrl = (globalThis as { MOCK_REGISTRY_URL?: string })?.MOCK_REGISTRY_URL
    this.mockBaseUrl = options.baseUrl ?? envMockRegistryUrl ?? "http://localhost:8080"

    console.log("Mock Registry Base URL:", this.mockBaseUrl)
  }

  override async getCircuitManifest(
    _root?: string,
    _options?: { validate?: boolean; ipfs?: boolean; version?: string },
  ): Promise<CircuitManifest> {
    const response = await fetch(`${this.mockBaseUrl}/manifest.json`)
    if (!response.ok) {
      throw new Error(`Failed to fetch circuit manifest from ${this.mockBaseUrl}`)
    }
    return response.json()
  }

  override async getPackagedCircuit(
    circuitName: string,
    _manifest?: CircuitManifest,
    _options?: { validate?: boolean; ipfs?: boolean },
  ): Promise<PackagedCircuit> {
    const response = await fetch(`${this.mockBaseUrl}/circuits/${circuitName}.json`)
    if (!response.ok) {
      throw new Error(`Failed to fetch circuit ${circuitName} from ${this.mockBaseUrl}`)
    }
    const circuit = await response.json()
    if (!circuit) {
      throw new Error(`Empty response for circuit ${circuitName}`)
    }
    return circuit
  }
}
