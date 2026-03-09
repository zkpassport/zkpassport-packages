import {
  blindQuery,
  unblindResponse,
  finalizeOutput,
  randomBlindingFactor,
  prepareBlindingFactor,
} from "@taceo/oprf-core"
import {
  initSessions,
  finishSessions,
  generateChallengeRequest,
  verifyDlogEquality,
  toOprfUri,
} from "@taceo/oprf-client"
import {
  OPRF_DEFAULT_SERVICES,
  OPRF_DEFAULT_THRESHOLD,
  OPRF_DEFAULT_MODULE,
  OPRF_DEFAULT_DOMAIN_SEPARATOR,
} from "./constants"
import { evaluateMock } from "./mock"
import type { OPRFEvaluatorOptions, OPRFResult } from "./types"

/**
 *
 * @param dg2Hash - The DG2 hash to evaluate the OPRF for (OPRF input).
 * @param options.mock - Whether to use the mock evaluator (for testing).
 * @param options.services - The services to use for the OPRF (Node URLs).
 * @param options.threshold - The threshold for the OPRF (number of nodes required to complete the OPRF).
 * @param options.authModuleName - The auth module name to use for the OPRF (default is "default").
 * @param options.auth - The auth to use for the OPRF (default is empty object).
 * @returns The OPRF result.
 */
export async function evaluateOPRF(
  dg2Hash: bigint,
  options: OPRFEvaluatorOptions = {},
): Promise<OPRFResult> {
  if (options.mock) {
    const sk = typeof options.mock === "object" ? options.mock.secretKey : undefined
    return evaluateMock(dg2Hash, sk)
  }

  const baseUrls = options.services ?? OPRF_DEFAULT_SERVICES
  const threshold = options.threshold ?? OPRF_DEFAULT_THRESHOLD
  const services = baseUrls.map((url) => toOprfUri(url, options.moduleName ?? OPRF_DEFAULT_MODULE))

  const beta = randomBlindingFactor()
  const blindedRequest = blindQuery(dg2Hash, beta)
  const requestId = globalThis.crypto.randomUUID()

  const sessions = await initSessions(services, threshold, {
    request_id: requestId,
    blinded_query: blindedRequest,
    auth: options.apiKey ? { api_key: options.apiKey } : {},
  })

  const challenge = generateChallengeRequest(sessions)
  const proofShares = await finishSessions(sessions, challenge)

  const pk = sessions.oprfPublicKeys[0]
  const proof = verifyDlogEquality(requestId, pk, blindedRequest, proofShares, challenge)

  const blindedResponse = challenge.blindedResponse()
  const response = unblindResponse(blindedResponse, prepareBlindingFactor(beta))
  const oprfOutput = finalizeOutput(
    options.domainSeparator || OPRF_DEFAULT_DOMAIN_SEPARATOR,
    dg2Hash,
    response,
  )

  return {
    oprfProof: {
      pk: { x: toHex(pk.x), y: toHex(pk.y) },
      dlog_e: toHex(proof.e),
      dlog_s: toHex(proof.s),
      response_blinded: { x: toHex(blindedResponse.x), y: toHex(blindedResponse.y) },
      response: { x: toHex(response.x), y: toHex(response.y) },
      beta: toHex(beta),
    },
    oprfOutput,
    publicKey: pk,
  }
}

function toHex(v: bigint): string {
  return `0x${v.toString(16)}`
}
