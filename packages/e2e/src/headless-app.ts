import { Bridge, type BridgeInterface } from "@obsidion/bridge"
import { createRegistryClient } from "@zkpassport/registry"
import {
  getChainFromQuery,
  type PassportViewModel,
  type Query,
  type SupportedChain,
} from "@zkpassport/utils"
import type { RegistryOverrides } from "./sepolia-fork"
import type { TrackedRequest } from "./tracked-request"
import { proveFastMode } from "./prove"

export type HeadlessApp = { bridge: BridgeInterface; chain: SupportedChain }

/**
 * The app's side of a request, without a phone: join the bridge, accept, prove, send every proof,
 * then done. It proves on the registry of the chain getChainFromQuery picks for the request, with
 * `registry` overriding that chain's defaults.
 *
 * Unlike the app it does not check the bridge-reported origin with isOriginTrusted(): the SDK under
 * Node reports "nodejs", which the app rejects.
 */
export async function runHeadlessApp({
  request: { url: requestUrl },
  passport,
  registry = {},
  circuitVersion,
}: {
  request: TrackedRequest
  passport: PassportViewModel
  registry?: RegistryOverrides
  circuitVersion: string
}): Promise<HeadlessApp> {
  const request = parseRequestUrl(requestUrl)
  if (request.mode !== "fast") {
    throw new Error(`Only fast mode is handled so far, got ${request.mode}`)
  }
  const chain = getChainFromQuery(request.query, request.devMode)

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
  const { proofs, queryResult } = await proveFastMode({
    passport,
    query: request.query,
    domain: request.domain,
    scope: request.service.scope,
    circuitVersion,
    registry: createRegistryClient(chain, registry),
  })

  // The app sends all proofs after proving (AccessRequestView.tsx), then done
  for (const proof of proofs) {
    await bridge.sendMessage("proof", proof)
  }
  await bridge.sendMessage("done", queryResult)
  return { bridge, chain }
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
