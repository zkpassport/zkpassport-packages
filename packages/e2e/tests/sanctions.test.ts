/**
 * Sanctions, end to end on a fork of Sepolia, against the sanctions root on chain:
 *
 *   SDK request() with .sanctions() in dev mode → bridge → headless app (john) proves against the
 *   tree published for Sepolia's latest sanctions root → SDK verify() checks that root in the
 *   Sanctions Registry
 *
 * For a sanctioned person, the headless app reports "Sanctions check failed" to the SDK instead of
 * proving, as the app does.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createRegistryClient } from "@zkpassport/registry"
import { ZKPassport } from "@zkpassport/sdk"
import type { PassportViewModel } from "@zkpassport/utils"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import {
  type ChainFork,
  type FetchProxy,
  SEPOLIA_FILE_HOSTS,
  SEPOLIA_RPC_URL,
  startChainFork,
  startFetchProxy,
} from "../src/chain-fork"
import { type BridgeRelay, startBridgeRelay } from "../src/bridge-relay"
import { type HeadlessApp, runHeadlessApp } from "../src/headless-app"

const CIRCUIT_VERSION = "0.21.0"
const DOMAIN = "localhost"
// A public official on OFAC's list since 2006, so the test names nobody private
const SANCTIONED_PERSON = {
  firstName: "Lidziya",
  middleName: "Mihaulauna",
  lastName: "Yarmoshina",
  dateOfBirth: new Date("1953-01-29"),
}

describe("sanctions, end to end on a Sepolia fork", () => {
  let fork: ChainFork
  let bridgeRelay: BridgeRelay
  let fetchProxy: FetchProxy
  let sanctionsRoot: string
  let app: HeadlessApp
  let zkPassport: ZKPassport

  beforeAll(async () => {
    fork = await startChainFork(SEPOLIA_RPC_URL)
    sanctionsRoot = await createRegistryClient(
      "ethereum_sepolia",
      fork.registry,
    ).getLatestSanctionsRoot()
    bridgeRelay = startBridgeRelay()
    fetchProxy = startFetchProxy(SEPOLIA_FILE_HOSTS)

    zkPassport = new ZKPassport(DOMAIN)
    app = await requestSanctionsCheck(createMockPassport())
  }, 180_000)

  afterAll(async () => {
    fetchProxy?.stop()
    app?.bridge.cleanup()
    await bridgeRelay?.stop()
    fork?.stop()
  })

  /** A fast-mode, non-strict sanctions request that the headless app answers with `passport` */
  async function requestSanctionsCheck(passport: PassportViewModel): Promise<HeadlessApp> {
    const queryBuilder = await zkPassport.request({
      name: "ZKPassport e2e",
      logo: "https://zkpassport.id/favicon.png",
      purpose: "End-to-end sanctions test",
      mode: "fast",
      devMode: true,
      bridgeUrl: bridgeRelay.url,
    })
    return runHeadlessApp({
      query: queryBuilder.sanctions().done(),
      passport,
      registry: fork.registry,
      circuitVersion: CIRCUIT_VERSION,
    })
  }

  test("john passes the non-strict sanctions check", () => {
    const { result: queryResult } = app.request.result()!
    expect(queryResult.sanctions?.passed).toBe(true)
    expect(queryResult.sanctions?.isStrict).toBe(false)
  })

  test("the sanctions proof commits to Sepolia's latest sanctions root", () => {
    const { proofs } = app.request.result()!
    const sanctionsProof = proofs.find((proof) => proof.name === "exclusion_check_sanctions")!
    expect(sanctionsProof.committedInputs?.exclusion_check_sanctions).toEqual({
      rootHash: sanctionsRoot,
      isStrict: false,
    })
  })

  test("the proofs verify against Sepolia's registries", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const verification = await zkPassport.verify({
      proofs: proofs.map((proof) => ({ ...proof })),
      originalQuery: app.request.query,
      queryResult,
      devMode: true,
      verifierMode: "local",
      config: { rpcUrl: fork.rpcUrl },
    })
    expect(verification.queryResultErrors).toBeUndefined()
    expect(verification.verified).toBe(true)
  }, 60_000)

  test("a proof whose committed root was swapped does not verify", async () => {
    const { proofs, result: queryResult } = app.request.result()!
    const tamperedProofs = proofs.map((proof) => ({ ...proof }))
    const target = tamperedProofs.find((proof) => proof.name === "exclusion_check_sanctions")!
    target.committedInputs = {
      exclusion_check_sanctions: { rootHash: `0x${"0".repeat(63)}1`, isStrict: false },
    }

    const verification = await zkPassport.verify({
      proofs: tamperedProofs,
      originalQuery: app.request.query,
      queryResult,
      devMode: true,
      verifierMode: "local",
      config: { rpcUrl: fork.rpcUrl },
    })
    expect(verification.verified).toBe(false)
  }, 60_000)

  test("a sanctioned person's passport fails the sanctions check", async () => {
    const sanctionedApp = await requestSanctionsCheck(createMockPassport(SANCTIONED_PERSON))
    sanctionedApp.bridge.cleanup()

    expect(sanctionedApp.request.events.at(-1)).toEqual({
      type: "error",
      error: "Sanctions check failed",
    })
    expect(sanctionedApp.request.generatedProofs()).toEqual([])
  }, 60_000)
})
