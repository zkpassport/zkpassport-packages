import { babyjubjub } from "@noble/curves/misc.js"
import {
  blindQuery,
  randomBlindingFactor,
  prepareBlindingFactor,
  unblindResponse,
  finalizeOutput,
  dlogEqualityProof,
  Fr,
  BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE,
} from "@taceo/oprf-core"
import type { OPRFProof, OPRFResult } from "./types"
import { OPRF_DEFAULT_DOMAIN_SEPARATOR } from "./constants"

const G = babyjubjub.Point.fromAffine(BABYJUBJUB_SUBGROUP_GENERATOR_AFFINE)
const SCALAR_ORDER = Fr.ORDER

function toHex(value: bigint): string {
  return `0x${value.toString(16)}`
}

function randomScalar(): bigint {
  const bytes = new Uint8Array(32)
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes } = require("crypto")
    const buf = randomBytes(32) as Buffer
    bytes.set(buf)
  }
  let scalar = BigInt("0x" + Buffer.from(bytes).toString("hex")) % SCALAR_ORDER
  if (scalar === 0n) scalar = 1n
  return scalar
}

export function generateOPRFKeypair(): { sk: bigint; pk: { x: bigint; y: bigint } } {
  const sk = randomScalar()
  const pkPoint = G.multiply(sk).toAffine()
  return { sk, pk: { x: pkPoint.x, y: pkPoint.y } }
}

export async function evaluateMock(dg2Hash: bigint, secretKey?: bigint): Promise<OPRFResult> {
  const sk = secretKey ?? randomScalar()
  const pk = G.multiply(sk).toAffine()

  // Client: blind
  const beta = randomBlindingFactor()
  const blindedQuery = blindQuery(dg2Hash, beta)

  // Server: evaluate + proof
  const responseBlinded = babyjubjub.Point.fromAffine(blindedQuery).multiply(sk).toAffine()
  const proof = dlogEqualityProof(blindedQuery, sk)

  // Client: unblind + finalize
  const response = unblindResponse(responseBlinded, prepareBlindingFactor(beta))
  const oprfOutput = finalizeOutput(OPRF_DEFAULT_DOMAIN_SEPARATOR, dg2Hash, response)

  const oprfProof: OPRFProof = {
    pk: { x: toHex(pk.x), y: toHex(pk.y) },
    dlog_e: toHex(proof.e),
    dlog_s: toHex(proof.s),
    response_blinded: { x: toHex(responseBlinded.x), y: toHex(responseBlinded.y) },
    response: { x: toHex(response.x), y: toHex(response.y) },
    beta: toHex(beta),
  }

  return { oprfProof, oprfOutput, publicKey: pk }
}
