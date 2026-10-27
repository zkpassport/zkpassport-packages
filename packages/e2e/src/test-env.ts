import {
  createRegistryClient,
  getNetworkConstants,
  type RegistryClient,
} from "@zkpassport/registry"
import { type QueryBuilder, type VerificationResult, ZKPassport } from "@zkpassport/sdk"
import {
  getIdFromChain,
  type PassportViewModel,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"
import { startBridgeRelay } from "./bridge-relay"
import { startChainFork, startFetchProxy } from "./chain-fork"
import { type HeadlessApp, runHeadlessApp } from "./headless-app"
import { loadLocalCircuits } from "./local-circuits"
import type { ProvingOverrides } from "./prove"

const SEPOLIA = getNetworkConstants(getIdFromChain("ethereum_sepolia"))
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || SEPOLIA.rpcUrl
const TESTNET_SANCTIONS_URL = "https://sanctions.zkpassport.id/testnet"
const SEPOLIA_FILE_HOSTS = [
  SEPOLIA.packagedCertificatesUrl,
  SEPOLIA.circuitUrl,
  TESTNET_SANCTIONS_URL,
].map((url) => new URL(url).hostname)
const CIRCUIT_VERSION = "0.21.1"
const DOMAIN = "localhost"

export type TestEnv = {
  /** A registry client for Sepolia that reads the fork */
  registry: RegistryClient
  /** URLs the fetch proxy blocked */
  blockedFetches: string[]
  /** A fast-mode dev-mode request with `query`, answered by the headless app with `passport` */
  runHeadlessApp: (options: {
    passport: PassportViewModel
    query: (query: QueryBuilder) => QueryBuilder
    overrides?: ProvingOverrides
  }) => Promise<HeadlessApp>
  /** verify() in dev mode with the local verifier, reading the fork's registries */
  verify: (options: {
    proofs: ProofResult[]
    queryResult: QueryResult
    originalQuery: Query
  }) => Promise<VerificationResult>
  /** Stop everything, including the bridges of every headless app it ran */
  stop: () => Promise<void>
}

/** Fork Sepolia, start the bridge relay, then restrict fetch to this machine and Sepolia's CDNs */
export async function startTestEnv(): Promise<TestEnv> {
  const localCircuits = process.env.LOCAL_CIRCUITS_DIR
    ? loadLocalCircuits(process.env.LOCAL_CIRCUITS_DIR, SEPOLIA.circuitUrl)
    : undefined
  const circuitVersion = localCircuits?.version ?? CIRCUIT_VERSION

  const fork = await startChainFork(SEPOLIA_RPC_URL)
  let bridgeRelay
  try {
    bridgeRelay = startBridgeRelay()
  } catch (error) {
    fork.stop()
    throw error
  }
  const fetchProxy = startFetchProxy(SEPOLIA_FILE_HOSTS, localCircuits?.serve)

  const zkPassport = new ZKPassport(DOMAIN)
  const apps: HeadlessApp[] = []

  return {
    registry: createRegistryClient("ethereum_sepolia", fork.registry),
    blockedFetches: fetchProxy.blocked,
    runHeadlessApp: async ({ passport, query, overrides }) => {
      const queryBuilder = await zkPassport.request({
        name: "ZKPassport e2e",
        logo: "https://zkpassport.id/favicon.png",
        purpose: "End-to-end test",
        mode: "fast",
        devMode: true,
        bridgeUrl: bridgeRelay.url,
      })
      const app = await runHeadlessApp({
        query: query(queryBuilder).done(),
        passport,
        registry: fork.registry,
        circuitVersion,
        overrides,
      })
      apps.push(app)
      return app
    },
    verify: ({ proofs, queryResult, originalQuery }) =>
      zkPassport.verify({
        proofs: proofs.map((proof) => ({ ...proof })),
        originalQuery,
        queryResult,
        devMode: true,
        verifierMode: "local",
        config: { rpcUrl: fork.rpcUrl },
      }),
    stop: async () => {
      fetchProxy.stop()
      for (const app of apps) {
        app.bridge.cleanup()
      }
      await bridgeRelay.stop()
      fork.stop()
    },
  }
}
