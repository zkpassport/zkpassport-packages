/**
 * Fast mode, end to end on a fork of Sepolia:
 *
 *   SDK request() → bridge → headless app (john, ZKR mock passport) → accept → 5 proofs → done
 *   → SDK onSuccess → verify({ devMode: true, verifierMode: "local" }) against Sepolia's registries
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { ZKPassport } from "@zkpassport/sdk"
import type { ProofResult, QueryResult } from "@zkpassport/utils"
import {
  type FetchProxy,
  SEPOLIA_FILE_HOSTS,
  startFetchProxy,
  startSepoliaFork,
  type SepoliaFork,
} from "../src/sepolia-fork"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import { startBridge, type Bridge } from "../src/bridge"
import { type HeadlessApp, runHeadlessApp } from "../src/headless-app"
import { type TrackedRequest, trackRequest } from "../src/tracked-request"

const CIRCUIT_VERSION = "0.21.0"
const DOMAIN = "localhost"
const CIRCUITS = [
  "sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256",
  "sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256",
  "data_check_integrity_sa_sha256_dg_sha256",
  "compare_age",
  "disclose_bytes",
]

describe("fast mode, end to end on a Sepolia fork", () => {
  let fork: SepoliaFork
  let bridge: Bridge
  let fetchProxy: FetchProxy
  let headlessApp: HeadlessApp
  let zkPassport: ZKPassport
  let received: { proofs: ProofResult[]; result: QueryResult }
  let request: TrackedRequest

  beforeAll(async () => {
    fork = await startSepoliaFork()
    bridge = startBridge()
    fetchProxy = startFetchProxy(SEPOLIA_FILE_HOSTS)

    zkPassport = new ZKPassport(DOMAIN)
    const queryBuilder = await zkPassport.request({
      name: "ZKPassport e2e",
      logo: "https://zkpassport.id/favicon.png",
      purpose: "End-to-end test",
      mode: "fast",
      devMode: true,
      bridgeUrl: bridge.url,
    })
    request = trackRequest(queryBuilder.gte("age", 18).disclose("nationality").done())

    headlessApp = await runHeadlessApp({
      request,
      passport: createMockPassport(),
      registry: fork.registry,
      circuitVersion: CIRCUIT_VERSION,
    })
    received = await request.success
  }, 180_000)

  afterAll(async () => {
    fetchProxy?.stop()
    headlessApp?.bridge.cleanup()
    await bridge?.stop()
    fork?.stop()
  })

  test("the SDK sees the whole request over the bridge", () => {
    // A dev-mode request that binds no chain is proved on Sepolia, as in the app
    expect(headlessApp.chain).toBe("ethereum_sepolia")
    expect(request.events).toEqual([
      "requestReceived",
      "generatingProof",
      ...CIRCUITS.map((name) => `proof:${name}`),
      "success",
    ])
    expect(received.proofs.map((proof) => proof.name)).toEqual(CIRCUITS)
    expect(received.result).toEqual({
      age: { gte: { expected: 18, result: true } },
      nationality: { disclose: { result: "ZKR" as string } },
    } as QueryResult) // ZKR is a mock country, not in the Alpha3Code list
  })

  test("the proofs verify against Sepolia's registries", async () => {
    const verification = await zkPassport.verify({
      proofs: received.proofs.map((proof) => ({ ...proof })),
      originalQuery: request.query,
      queryResult: received.result,
      devMode: true,
      verifierMode: "local",
      config: { rpcUrl: fork.rpcUrl },
    })
    expect(verification.verified).toBe(true)
    // ZKR passports get a mock nullifier, which verify() accepts only in dev mode
    expect(verification.uniqueIdentifierType).toBe(2) // NullifierType.NON_SALTED_MOCK
  }, 60_000)

  test("a tampered proof does not verify", async () => {
    const proofs = received.proofs.map((proof) => ({ ...proof }))
    const target = proofs.find((proof) => proof.name === "disclose_bytes")!
    const proofHex = target.proof as string
    const offsetInProofBody = proofHex.length - 200
    const flippedByte = (
      (parseInt(proofHex.slice(offsetInProofBody, offsetInProofBody + 2), 16) ^ 0xff) &
      0xff
    )
      .toString(16)
      .padStart(2, "0")
    target.proof =
      proofHex.slice(0, offsetInProofBody) + flippedByte + proofHex.slice(offsetInProofBody + 2)

    const verification = await zkPassport.verify({
      proofs,
      originalQuery: request.query,
      queryResult: received.result,
      devMode: true,
      verifierMode: "local",
      config: { rpcUrl: fork.rpcUrl },
    })
    expect(verification.verified).toBe(false)
  }, 60_000)

  test("nothing but the SDK's dashboard lookup tried to reach other hosts", () => {
    // request() looks the domain up on the dashboard API and carries on when that fails
    expect(
      fetchProxy.blocked.every((url) => url.startsWith("https://dashboard-api.zkpassport.id/")),
    ).toBe(true)
  })
})
