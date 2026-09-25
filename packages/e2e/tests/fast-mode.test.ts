/**
 * Fast mode, end to end on a local devnet:
 *
 *   SDK request() → relay → app stand-in (john, ZKR mock passport) → accept → 5 proofs → done
 *   → SDK onSuccess → verify({ devMode: true, verifierMode: "local" }) against the anvil registry
 *
 * Only fetch() calls to this machine are allowed while the flow runs (see network-guard.ts).
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import type { BridgeInterface } from "@obsidion/bridge"
import { createRegistryClient } from "@zkpassport/registry"
import { ZKPassport } from "@zkpassport/sdk"
import type { ProofResult, Query, QueryResult } from "@zkpassport/utils"
import { CERTIFICATES_FILE, mirrorCircuits, startDevnet, type Devnet } from "../src/devnet"
import { guardNetwork } from "../src/network-guard"
import { buildJohn } from "../src/passport"
import { isRelayInstalled, startRelay, type Relay } from "../src/relay"
import { runStandIn } from "../src/stand-in"

const CIRCUIT_VERSION = "0.21.0"
const DOMAIN = "localhost"
// What john's fast-mode age + nationality request proves
const CIRCUITS = [
  "sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256",
  "sig_check_id_data_tbs_700_rsa_pkcs_2048_sha256",
  "data_check_integrity_sa_sha256_dg_sha256",
  "compare_age",
  "disclose_bytes",
]

const relayInstalled = await isRelayInstalled()
if (!relayInstalled) {
  console.warn(
    "Skipping e2e: the optional relay dependency (the bridge relay server) is not installed",
  )
}

describe.skipIf(!relayInstalled)("fast mode, end to end on anvil", () => {
  let devnet: Devnet
  let relay: Relay
  let guard: ReturnType<typeof guardNetwork>
  let standInBridge: BridgeInterface | undefined
  let zkPassport: ZKPassport
  let received: { proofs: ProofResult[]; result: QueryResult }
  let originalQuery: Query
  const events: string[] = []

  beforeAll(async () => {
    const manifest = await mirrorCircuits({ version: CIRCUIT_VERSION, circuits: CIRCUITS })
    const certificateRoot: string = JSON.parse(readFileSync(CERTIFICATES_FILE, "utf8")).root
    devnet = await startDevnet({
      certificateRoot,
      circuitRoot: manifest.root,
      circuitVersion: CIRCUIT_VERSION,
    })
    relay = await startRelay()
    guard = guardNetwork()

    zkPassport = new ZKPassport(DOMAIN, { network: "dev", registry: devnet.registry })
    const queryBuilder = await zkPassport.request({
      name: "ZKPassport e2e",
      logo: "https://zkpassport.id/favicon.png",
      purpose: "End-to-end test",
      mode: "fast",
      devMode: true,
      bridgeUrl: relay.url,
    })
    const request = queryBuilder.gte("age", 18).disclose("nationality").done()
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

    const standIn = await runStandIn({
      requestUrl: request.url,
      passport: buildJohn(),
      registry: createRegistryClient("dev", devnet.registry),
      circuitVersion: CIRCUIT_VERSION,
    })
    standInBridge = standIn.bridge
    received = await success
  }, 180_000)

  afterAll(async () => {
    guard?.restore()
    standInBridge?.cleanup()
    await relay?.stop()
    devnet?.stop()
  })

  test("the SDK sees the whole request over the bridge", () => {
    expect(events).toEqual([
      "requestReceived",
      "generatingProof",
      ...CIRCUITS.map((name) => `proof:${name}`),
      "success",
    ])
    expect(received.proofs.map((p) => p.name)).toEqual(CIRCUITS)
    expect(received.result).toEqual({
      age: { gte: { expected: 18, result: true } },
      nationality: { disclose: { result: "ZKR" as string } },
    } as QueryResult) // ZKR is a mock country, not in the Alpha3Code list
  })

  test("the proofs verify against the anvil registry", async () => {
    const verification = await zkPassport.verify({
      proofs: received.proofs.map((p) => ({ ...p })),
      originalQuery,
      queryResult: received.result,
      devMode: true,
      verifierMode: "local",
    })
    expect(verification.verified).toBe(true)
    // ZKR passports get a mock nullifier, which verify() accepts only in dev mode
    expect(verification.uniqueIdentifierType).toBe(2) // NullifierType.NON_SALTED_MOCK
  }, 60_000)

  test("a tampered proof does not verify", async () => {
    const proofs = received.proofs.map((p) => ({ ...p }))
    const target = proofs.find((p) => p.name === "disclose_bytes")!
    const hex = target.proof as string
    const at = hex.length - 200 // inside the proof body, after the public inputs
    const flipped = ((parseInt(hex.slice(at, at + 2), 16) ^ 0xff) & 0xff)
      .toString(16)
      .padStart(2, "0")
    target.proof = hex.slice(0, at) + flipped + hex.slice(at + 2)
    const verification = await zkPassport.verify({
      proofs,
      originalQuery,
      queryResult: received.result,
      devMode: true,
      verifierMode: "local",
    })
    expect(verification.verified).toBe(false)
  }, 60_000)

  test("nothing but the SDK's dashboard lookup tried to leave the machine", () => {
    // request() looks the domain up on the dashboard API and carries on when that fails
    expect(
      guard.blocked.every((url) => url.startsWith("https://dashboard-api.zkpassport.id/")),
    ).toBe(true)
  })
})
