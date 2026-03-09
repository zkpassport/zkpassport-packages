import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { toOprfUri, distributedOprf } from "@taceo/oprf-client"
import {
  OPRF_DEFAULT_SERVICES,
  OPRF_DEFAULT_THRESHOLD,
  OPRF_DEFAULT_MODULE,
  OPRF_DEFAULT_DOMAIN_SEPARATOR,
} from "./constants"
import { evaluateMock } from "./mock"
import type { OPRFEvaluatorAuth, OPRFEvaluatorOptions, OPRFPublicKey, OPRFResult } from "./types"

export async function evaluateOPRF(
  privateNullifier: bigint,
  blindingFactor: bigint,
  auth: OPRFEvaluatorAuth,
  options: OPRFEvaluatorOptions = {},
): Promise<OPRFResult> {
  if (options.mock) {
    const sk = typeof options.mock === "object" ? options.mock.secretKey : undefined
    return evaluateMock(privateNullifier, sk)
  }

  const baseUrls = options.services ?? OPRF_DEFAULT_SERVICES
  const threshold = options.threshold ?? OPRF_DEFAULT_THRESHOLD
  const domainSeparator = options.domainSeparator ?? OPRF_DEFAULT_DOMAIN_SEPARATOR
  const services = baseUrls.map((url) => toOprfUri(url, options.moduleName ?? OPRF_DEFAULT_MODULE))

  const result = await distributedOprf(
    services,
    threshold,
    privateNullifier, // query
    blindingFactor,
    domainSeparator,
    auth,
  )
  const pk = result.oprfPublicKey
  const dlogProof = result.dlogProof
  const blindedResponse = result.blindedResponse
  const response = result.unblindedResponse
  const oprfOutput = result.output

  return {
    oprfProof: {
      pk: { x: toHex(pk.x), y: toHex(pk.y) },
      dlog_e: toHex(dlogProof.e),
      dlog_s: toHex(dlogProof.s),
      response_blinded: { x: toHex(blindedResponse.x), y: toHex(blindedResponse.y) },
      response: { x: toHex(response.x), y: toHex(response.y) },
      beta: toHex(blindingFactor),
    },
    oprfOutput,
    publicKey: pk,
  }
}

function toHex(v: bigint): string {
  return `0x${v.toString(16)}`
}

export async function getOprfPublicKey(keyId: string, services?: string[]): Promise<OPRFPublicKey> {
  const baseUrls = services ?? OPRF_DEFAULT_SERVICES
  let lastError: Error | undefined
  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/oprf_pub/${keyId}`)
      if (!response.ok) {
        throw new Error(`OPRF node returned ${response.status}`)
      }
      const data = await response.json()
      // Handle both wire format (array ["x", "y"]) and object format ({x, y})
      if (Array.isArray(data)) {
        return { x: BigInt(data[0]), y: BigInt(data[1]) }
      }
      if (data.key) {
        const key = Array.isArray(data.key) ? data.key : data.key
        return { x: BigInt(key[0]), y: BigInt(key[1]) }
      }
      return { x: BigInt(data.x), y: BigInt(data.y) }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }
  throw new Error(`Failed to fetch OPRF public key for key ID ${keyId}: ${lastError?.message}`)
}

export async function hashOprfPublicKey(pk: OPRFPublicKey): Promise<bigint> {
  return poseidon2HashAsync([pk.x, pk.y])
}
