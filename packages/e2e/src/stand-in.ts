import { Bridge, type BridgeInterface } from "@obsidion/bridge"
import type { RegistryClient } from "@zkpassport/registry"
import type { PassportViewModel, ProofResult, Query } from "@zkpassport/utils"
import { proveFastMode } from "./prove"

const decodeBase64Json = (s: string) => JSON.parse(Buffer.from(s, "base64").toString("utf8"))

export type ParsedRequest = {
  domain: string
  pubkey: string
  query: Query
  service: { bridgeUrl?: string; scope?: string; [key: string]: unknown }
  mode: string
  devMode: boolean
}

/** Read a request URL the way the app's src/hooks/useParseDeepLinkParams.ts does */
export function parseRequestUrl(requestUrl: string): ParsedRequest {
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

/**
 * The phone's half of a request, headless: join the bridge the way the app's
 * src/context/WebSocketContext.tsx does, send accept, prove, send every proof, then done.
 *
 * Unlike the app it does not check the relay-reported origin with isOriginTrusted(): a Node SDK
 * reports "nodejs", which the app would reject.
 */
export async function runStandIn({
  requestUrl,
  passport,
  registry,
  circuitVersion,
  onProof,
}: {
  requestUrl: string
  passport: PassportViewModel
  registry: RegistryClient
  circuitVersion: string
  onProof?: (proof: ProofResult, timing: { witnessMs: number; proveMs: number }) => void
}): Promise<{ bridge: BridgeInterface; request: ParsedRequest; origin: string | undefined }> {
  const request = parseRequestUrl(requestUrl)
  if (request.mode !== "fast")
    throw new Error(`Only fast mode is handled so far, got ${request.mode}`)

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
    registry,
    onProof,
  })
  // The app sends all proofs after proving (AccessRequestView.tsx), then done
  for (const proof of proofs) await bridge.sendMessage("proof", proof)
  await bridge.sendMessage("done", queryResult)
  return { bridge, request, origin: bridge.origin }
}
