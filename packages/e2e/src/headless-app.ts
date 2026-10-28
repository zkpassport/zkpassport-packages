import { Bridge, type BridgeInterface } from "@obsidion/bridge"
import { createRegistryClient } from "@zkpassport/registry"
import type { QueryBuilderResult, RequestSuccess } from "@zkpassport/sdk"
import {
  getChainFromQuery,
  type PassportViewModel,
  type ProofMode,
  type ProofResult,
  type Query,
  type SupportedChain,
} from "@zkpassport/utils"
import type { RegistryOverrides } from "./chain-fork"
import {
  proveFastMode,
  proveOuterProof,
  type ProvingOverrides,
  SanctionsCheckFailedError,
} from "./prove"

/** The proof modes the headless app answers requests in */
export type HeadlessAppMode = Extract<ProofMode, "fast" | "compressed">

export type HeadlessApp = {
  bridge: BridgeInterface
  chain: SupportedChain
  request: TrackedRequest
}

export type RequestEvent =
  | { type: "requestReceived" }
  | { type: "generatingProof" }
  | { type: "proofGenerated"; proof: ProofResult }
  | { type: "success"; response: RequestSuccess }
  | { type: "error"; error: string }

/**
 * A simplified mock of the mobile app, to enable integration testing.
 */
export async function runHeadlessApp({
  query,
  passport,
  registry = {},
  circuitVersion,
  overrides,
}: {
  query: QueryBuilderResult
  passport: PassportViewModel
  registry?: RegistryOverrides
  circuitVersion: string
  overrides?: ProvingOverrides
}): Promise<HeadlessApp> {
  const { trackedRequest, outcome } = trackRequest(query)
  const request = parseRequestUrl(trackedRequest.url)
  if (request.mode !== "fast" && request.mode !== "compressed") {
    throw new Error(`Only fast and compressed modes are handled so far, got ${request.mode}`)
  }
  const chain = getChainFromQuery(request.query, request.devMode)
  const registryClient = createRegistryClient(chain, registry)

  const origin =
    (/localhost|192\.168\.|127\.0/.test(request.domain) ? "http://" : "https://") + request.domain
  const bridge = await Bridge.join(`obsidion:${request.pubkey}?d=${origin}`, {
    bridgeUrl: request.service.bridgeUrl,
    originOnConnect: true,
    pinOrigin: false,
  })
  if (!bridge.isSecureChannelEstablished()) {
    await new Promise<void>((resolve) => bridge.onSecureChannelEstablished(resolve))
  }

  await bridge.sendMessage("accept")
  try {
    const { proofs, queryResult } = await proveFastMode({
      passport,
      query: request.query,
      domain: request.domain,
      scope: request.service.scope,
      circuitVersion,
      registry: registryClient,
      overrides,
    })
    // In compressed mode the app sends only the outer proof
    const proofsToSend =
      request.mode === "compressed"
        ? [await proveOuterProof({ subproofs: proofs, circuitVersion, registry: registryClient })]
        : proofs

    // The app sends all proofs after proving (AccessRequestView.tsx), then done
    for (const proof of proofsToSend) {
      await bridge.sendMessage("proof", proof)
    }
    await bridge.sendMessage("done", queryResult)
  } catch (error) {
    if (!(error instanceof SanctionsCheckFailedError)) {
      throw error
    }
    await bridge.sendMessage("error", { error: "Sanctions check failed" })
  }
  await outcome
  return { bridge, chain, request: trackedRequest }
}

export class TrackedRequest {
  constructor(
    readonly url: string,
    readonly query: Query,
    readonly events: RequestEvent[],
  ) {}

  /** The response of the success event the request ended with, if it ended in one */
  result(): RequestSuccess | undefined {
    const lastEvent = this.events.at(-1)
    return lastEvent?.type === "success" ? lastEvent.response : undefined
  }

  /** The proofs of the request's proofGenerated events, in order */
  generatedProofs(): ProofResult[] {
    return this.events
      .filter((event) => event.type === "proofGenerated")
      .map((event) => event.proof)
  }

  /** The errors the request resulted in, in order */
  errors(): string[] {
    return this.events.filter((event) => event.type === "error").map((event) => event.error)
  }
}

/**
 * Record a request's SDK callbacks as events. The outcome resolves when the SDK reports success or
 * an error, and rejects when it reports a reject.
 */
function trackRequest(request: QueryBuilderResult): {
  trackedRequest: TrackedRequest
  outcome: Promise<void>
} {
  const events: RequestEvent[] = []
  const outcome = new Promise<void>((resolve, reject) => {
    request.onRequestReceived(() => events.push({ type: "requestReceived" }))
    request.onGeneratingProof(() => events.push({ type: "generatingProof" }))
    request.onProofGenerated((proof) => events.push({ type: "proofGenerated", proof }))
    request.onSuccess((response) => {
      events.push({ type: "success", response })
      resolve()
    })
    request.onError((error) => {
      events.push({ type: "error", error })
      resolve()
    })
    request.onReject(() => reject(new Error("onReject")))
  })
  return { trackedRequest: new TrackedRequest(request.url, request.query, events), outcome }
}

type ParsedRequest = {
  domain: string
  pubkey: string
  query: Query
  service: { bridgeUrl?: string; scope?: string; [key: string]: unknown }
  mode: string
  devMode: boolean
}

/** Read a request URL the way the app's src/hooks/useParseDeepLinkParams.ts does */
function parseRequestUrl(requestUrl: string): ParsedRequest {
  const params = new URL(requestUrl).searchParams
  return {
    domain: params.get("d")!,
    pubkey: params.get("p")!,
    query: decodeBase64Json(params.get("c")!),
    service: decodeBase64Json(params.get("s")!),
    mode: params.get("m") ?? "fast",
    devMode: params.get("dev") === "1",
  }
}

function decodeBase64Json(base64: string) {
  return JSON.parse(Buffer.from(base64, "base64").toString("utf8"))
}
