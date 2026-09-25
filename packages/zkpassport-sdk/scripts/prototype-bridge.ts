/**
 * PROTOTYPE — throwaway spike, not for merge. Step 2 of 2 (step 1: prototype-node-proofs.ts).
 *
 * Question: does a full request survive the bridge? The SDK creates a request against a local
 * relay; a headless "app stand-in" parses the request URL, joins the bridge the way
 * zkpassport-mobile-app does (src/context/WebSocketContext.tsx), sends accept → 5 proofs → done,
 * and the SDK verifies what it received with verify({ devMode: true, verifierMode: "local" }).
 *
 * Relay: the bridge relay server, started in-process (rate limits off,
 * memory store). Set RELAY_DIR if it isn't cloned at ~/bridge-relay.
 * Registry: Sepolia (devMode). Proving: prototype-prove.ts.
 *
 * Run from the repo root: bun packages/zkpassport-sdk/scripts/prototype-bridge.ts
 */
import { homedir } from "node:os"
import { Bridge } from "@obsidion/bridge"
import type { ProofResult, Query, QueryResult } from "@zkpassport/utils"
import { ZKPassport } from "../src/index"
import { log, proveJohnFastMode } from "./prototype-prove"

const DOMAIN = "localhost"
const RELAY_DIR = process.env.RELAY_DIR ?? `${homedir()}/bridge-relay`
const TIMEOUT_MS = 5 * 60_000
const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2)
const decodeBase64Json = (s: string) => JSON.parse(Buffer.from(s, "base64").toString("utf8"))

// --- App stand-in: the phone's half of the request, headless ---
async function runStandIn(requestUrl: string) {
  // Same params the app's useParseDeepLinkParams.ts reads
  const params = new URL(requestUrl).searchParams
  const domain = params.get("d")!
  const pubkey = params.get("p")!
  const query: Query = decodeBase64Json(params.get("c")!)
  const service = decodeBase64Json(params.get("s")!)
  const mode = params.get("m") ?? "fast"
  const devMode = params.get("dev") === "1"
  log(
    `stand-in: request from ${domain}, mode ${mode}, dev ${devMode}, query ${JSON.stringify(query)}`,
  )
  log(`stand-in: service ${JSON.stringify(service)}`)
  if (mode !== "fast") throw new Error(`Prototype only does fast mode, got ${mode}`)

  // Same connection string and join options as the app's WebSocketContext.tsx
  const origin = (/localhost|192\.168\.|127\.0/.test(domain) ? "http://" : "https://") + domain
  const bridge = await Bridge.join(`obsidion:${pubkey}?d=${origin}`, {
    bridgeUrl: service.bridgeUrl,
    originOnConnect: true,
    pinOrigin: false,
  })
  if (!bridge.isSecureChannelEstablished()) {
    await new Promise<void>((resolve) => bridge.onSecureChannelEstablished(resolve))
  }
  // The real app would now check this origin with isOriginTrusted(); a Node SDK reports "nodejs"
  log(`stand-in: secure channel up, relay-reported origin ${bridge.origin}`)

  await bridge.sendMessage("accept")
  log("stand-in: sent accept")
  const { proofs, queryResult } = await proveJohnFastMode({
    domain,
    scope: service.scope,
    query,
    devMode,
  })
  // The app sends all proofs after proving (AccessRequestView.tsx), then done after a short delay
  for (const proof of proofs) {
    const ok = await bridge.sendMessage("proof", proof)
    log(
      `stand-in: sent proof ${proof.index! + 1}/${proof.total} ${proof.name} (${(proof.proof as string).length / 2} bytes) ok=${ok}`,
    )
  }
  const ok = await bridge.sendMessage("done", queryResult)
  log(`stand-in: sent done ok=${ok}`)
  return bridge
}

async function main() {
  const { startServer } = await import(`${RELAY_DIR}/server/server.ts`)
  const { MemoryDataStore } = await import(`${RELAY_DIR}/server/datastore/memory.ts`)
  const relay = startServer({
    config: { port: 0, hostname: "127.0.0.1", rateLimit: { enabled: false } },
    store: new MemoryDataStore(),
  })
  const bridgeUrl = `ws://127.0.0.1:${relay.port}`
  log(`relay listening on ${bridgeUrl}`)

  const zkPassport = new ZKPassport(DOMAIN)
  const queryBuilder = await zkPassport.request({
    name: "E2E prototype",
    logo: "https://zkpassport.id/favicon.png",
    purpose: "Prototype of a cross-repo E2E test",
    mode: "fast",
    devMode: true,
    bridgeUrl,
  })
  const {
    url,
    query,
    onRequestReceived,
    onGeneratingProof,
    onProofGenerated,
    onSuccess,
    onReject,
    onError,
  } = queryBuilder.gte("age", 18).disclose("nationality").done()
  log(`sdk: request URL ${url.slice(0, 96)}…`)

  const success = new Promise<{ proofs: ProofResult[]; result: QueryResult }>((resolve, reject) => {
    onRequestReceived(() => log("sdk: onRequestReceived"))
    onGeneratingProof(() => log("sdk: onGeneratingProof"))
    onProofGenerated((proof) =>
      log(`sdk: onProofGenerated ${proof.name} index ${proof.index}/${proof.total}`),
    )
    onSuccess((response) => {
      log(`sdk: onSuccess with ${response.proofs.length} proofs`)
      resolve(response)
    })
    onReject(() => reject(new Error("sdk: onReject")))
    onError((error) => reject(new Error(`sdk: onError ${error}`)))
    setTimeout(() => reject(new Error(`timed out after ${TIMEOUT_MS} ms`)), TIMEOUT_MS)
  })

  const t0 = Date.now()
  const standInBridge = await runStandIn(url)
  const { proofs, result } = await success
  log(`round trip from stand-in join to onSuccess: ${Date.now() - t0} ms`)
  log("sdk: received result", json(result))

  log("sdk: verify() on the proofs that came over the bridge")
  const verification = await zkPassport.verify({
    proofs,
    originalQuery: query,
    queryResult: result,
    devMode: true,
    verifierMode: "local",
  })
  log("sdk: verification", json(verification))

  standInBridge.cleanup()
  await relay.stop()
  log(
    verification.verified
      ? "ANSWER: yes — the request survives the bridge and the proofs verify"
      : "ANSWER: no — see results above",
  )
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
