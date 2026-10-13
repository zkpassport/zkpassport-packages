/**
 * Sanctions, end to end on a fork of Sepolia, from today's OpenSanctions data to a verified proof:
 *
 *   sanctions publisher: download today's snapshots → build the tree → publish its root to the
 *   forked Sepolia Sanctions Registry, after Sepolia's own latest root
 *   → SDK request() with .sanctions() in dev mode → bridge → headless app (john) proves against the
 *   tree published for the registry's latest root → SDK verify() checks that root in the registry
 *
 * Needs the bridge (see src/bridge.ts) and the sanctions publisher (see src/sanctions-publisher.ts).
 * Building the tree from every dataset takes a few minutes.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { BridgeInterface } from "@obsidion/bridge"
import { createRegistryClient, type RegistryClient } from "@zkpassport/registry"
import { ZKPassport } from "@zkpassport/sdk"
import type { PackagedSanctionsFile, ProofResult, Query, QueryResult } from "@zkpassport/utils"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import {
  CACHE_DIR,
  type FetchInterceptor,
  interceptFetch,
  SEPOLIA_FILE_HOSTS,
  startSepoliaFork,
  takeOverSanctionsOracle,
  type SepoliaFork,
} from "../src/sepolia-fork"
import { findListedPerson, listedPersonPassport } from "../src/listed-person"
import { getSanctionsBuilder } from "../src/prove"
import { startBridge, type Bridge } from "../src/bridge"
import {
  downloadOpenSanctions,
  isSanctionsPublisherAvailable,
  publishSanctionsRoot,
  type PublishedSanctionsRoot,
} from "../src/sanctions-publisher"
import { runHeadlessApp } from "../src/headless-app"

const CIRCUIT_VERSION = "0.21.0"
const DOMAIN = "localhost"
// What john's fast-mode sanctions request proves
const CIRCUITS = [
  "sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256",
  "sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256",
  "data_check_integrity_sa_sha256_dg_sha256",
  "exclusion_check_sanctions",
]
const SNAPSHOTS_DIR = join(CACHE_DIR, "opensanctions")
// The last run's packaged file, tree and publisher log, kept for a look after a failure
const RUN_DIR = join(CACHE_DIR, "sanctions-run")
const DATASETS = ["ch_seco_sanctions", "eu_fsf", "gb_fcdo_sanctions", "us_ofac_sdn"]

const publisherAvailable = isSanctionsPublisherAvailable()
if (!publisherAvailable) {
  console.warn(
    "Skipping the sanctions e2e: SANCTIONS_PUBLISHER_DIR does not point at the sanctions publisher",
  )
}

describe.skipIf(!publisherAvailable)("sanctions, end to end on a Sepolia fork", () => {
  let fork: SepoliaFork
  let bridge: Bridge
  let fetchInterceptor: FetchInterceptor
  let registry: RegistryClient
  let sepoliaRoot: string
  let published: PublishedSanctionsRoot
  let appBridge: BridgeInterface | undefined
  let appChain: string | undefined
  let zkPassport: ZKPassport
  let received: { proofs: ProofResult[]; result: QueryResult }
  let originalQuery: Query
  const events: string[] = []

  beforeAll(async () => {
    fork = await startSepoliaFork()
    registry = createRegistryClient("ethereum_sepolia", fork.registry)
    // The publish faces the checks the scheduled testnet job does: Sepolia's current root, its
    // timestamp and a leaf count within 20% of it
    sepoliaRoot = await registry.getLatestSanctionsRoot()
    await takeOverSanctionsOracle(fork)

    // The publisher's own steps, against the fork, before fetch is intercepted
    await downloadOpenSanctions(SNAPSHOTS_DIR, process.env.OPENSANCTIONS_DATE)
    rmSync(RUN_DIR, { recursive: true, force: true })
    mkdirSync(RUN_DIR, { recursive: true })
    published = await publishSanctionsRoot({
      fork,
      snapshotsDir: SNAPSHOTS_DIR,
      workDir: RUN_DIR,
    })
    writeFileSync(join(RUN_DIR, "publisher.log"), published.log)
    console.log(published.log)
    fork.serveSanctionsTree(published.root, published.treeFile)

    bridge = startBridge()
    fetchInterceptor = interceptFetch(SEPOLIA_FILE_HOSTS)

    zkPassport = new ZKPassport(DOMAIN)
    const queryBuilder = await zkPassport.request({
      name: "ZKPassport e2e",
      logo: "https://zkpassport.id/favicon.png",
      purpose: "End-to-end sanctions test",
      mode: "fast",
      devMode: true,
      bridgeUrl: bridge.url,
    })
    const request = queryBuilder.sanctions().done()
    originalQuery = request.query

    const success = new Promise<{ proofs: ProofResult[]; result: QueryResult }>(
      (resolve, reject) => {
        request.onRequestReceived(() => events.push("requestReceived"))
        request.onGeneratingProof(() => events.push("generatingProof"))
        request.onProofGenerated((proof) => events.push(`proof:${proof.name}`))
        request.onSuccess((response) => {
          events.push("success")
          resolve(response)
        })
        request.onReject(() => reject(new Error("onReject")))
        request.onError((error) => reject(new Error(`onError: ${error}`)))
      },
    )

    const headlessApp = await runHeadlessApp({
      requestUrl: request.url,
      passport: createMockPassport(),
      registry: fork.registry,
      circuitVersion: CIRCUIT_VERSION,
    })
    appBridge = headlessApp.bridge
    appChain = headlessApp.chain
    received = await success
  }, 30 * 60_000)

  afterAll(async () => {
    fetchInterceptor?.restore()
    appBridge?.cleanup()
    await bridge?.stop()
    fork?.stop()
  })

  test("the publisher put today's root on the Sanctions Registry after Sepolia's own", async () => {
    const file = JSON.parse(readFileSync(published.packagedFile, "utf8")) as PackagedSanctionsFile
    expect(file.sources.map((source) => source.dataset)).toEqual(DATASETS)
    expect(file.environment).toBe("test")
    expect(file.previous_root).toBe(sepoliaRoot)
    expect(await registry.getLatestSanctionsRoot()).toBe(published.root)
    expect(await registry.isSanctionsRootValid(published.root)).toBe(true)
  })

  test("the SDK sees the whole request over the bridge", () => {
    // A dev-mode request that binds no chain is proved on Sepolia, as in the app
    expect(appChain).toBe("ethereum_sepolia")
    expect(events).toEqual([
      "requestReceived",
      "generatingProof",
      ...CIRCUITS.map((name) => `proof:${name}`),
      "success",
    ])
    expect(received.proofs.map((proof) => proof.name)).toEqual(CIRCUITS)
    expect(received.result.sanctions?.passed).toBe(true)
    expect(received.result.sanctions?.isStrict).toBe(false)
  })

  test("the sanctions proof commits to the published root", () => {
    const sanctionsProof = received.proofs.find(
      (proof) => proof.name === "exclusion_check_sanctions",
    )!
    expect(sanctionsProof.committedInputs?.exclusion_check_sanctions).toEqual({
      rootHash: published.root,
      isStrict: false,
    })
  })

  test("the proofs verify against Sepolia's registries", async () => {
    const verification = await zkPassport.verify({
      proofs: received.proofs.map((proof) => ({ ...proof })),
      originalQuery,
      queryResult: received.result,
      devMode: true,
      verifierMode: "local",
      config: { rpcUrl: fork.rpcUrl },
    })
    expect(verification.queryResultErrors).toBeUndefined()
    expect(verification.verified).toBe(true)
  }, 60_000)

  test("a proof whose committed root was swapped does not verify", async () => {
    const proofs = received.proofs.map((proof) => ({ ...proof }))
    const target = proofs.find((proof) => proof.name === "exclusion_check_sanctions")!
    target.committedInputs = {
      exclusion_check_sanctions: { rootHash: `0x${"0".repeat(63)}1`, isStrict: false },
    }

    const verification = await zkPassport.verify({
      proofs,
      originalQuery,
      queryResult: received.result,
      devMode: true,
      verifierMode: "local",
      config: { rpcUrl: fork.rpcUrl },
    })
    expect(verification.verified).toBe(false)
  }, 60_000)

  test("a person on today's OFAC list cannot build sanctions inputs against the tree", async () => {
    const person = findListedPerson(SNAPSHOTS_DIR, "us_ofac_sdn")
    const sanctions = await getSanctionsBuilder(registry)

    await expect(
      sanctions.getSanctionsMerkleProofs(listedPersonPassport(person), false),
    ).rejects.toThrow(/Target exists/)
    // john, with the same tree, is not on it
    await expect(
      sanctions.getSanctionsMerkleProofs(createMockPassport(), false),
    ).resolves.toBeDefined()
  }, 120_000)

  test("nothing but the SDK's dashboard lookup tried to reach other hosts", () => {
    // request() looks the domain up on the dashboard API and carries on when that fails
    expect(
      fetchInterceptor.blocked.every((url) =>
        url.startsWith("https://dashboard-api.zkpassport.id/"),
      ),
    ).toBe(true)
  })
})
