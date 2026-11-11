import { bn254 } from "@taceo/poseidon2"
import type { ProofResult } from "@/types"
import { OPRF_AUTH_COMMITMENT_DOMAIN_SEPARATOR, OPRF_DEFAULT_SERVICES } from "./constants"
import type { BabyJubJubPoint, OPRFProof } from "./types"

// BN254 scalar field modulus (= BabyJubJub base field), the field of pn, x and x'
const BN254_FR_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n

/**
 * Commitment to the auth secret, bound to the private nullifier:
 * x' = commit(pn, x) = Poseidon2_t3([DS, pn, x])[1].
 */
export function computeAuthCommitment(privateNullifier: bigint, authSecret: bigint): bigint {
  if (privateNullifier <= 0n || privateNullifier >= BN254_FR_MODULUS) {
    throw new Error("Private nullifier must be a nonzero field element")
  }
  if (authSecret <= 0n || authSecret >= BN254_FR_MODULUS) {
    throw new Error("Auth secret must be a nonzero field element")
  }
  return bn254.t3.permutation([
    OPRF_AUTH_COMMITMENT_DOMAIN_SEPARATOR,
    privateNullifier,
    authSecret,
  ])[1]
}

/**
 * Sample a fresh auth secret x: a uniformly random nonzero BN254 field element.
 * It must never leave the device.
 */
export function randomAuthSecret(): bigint {
  // 64 random bytes reduced mod p, so the modulo bias is negligible
  const bytes = new Uint8Array(64)
  globalThis.crypto.getRandomValues(bytes)
  let value = 0n
  for (const byte of bytes) value = (value << 8n) | BigInt(byte)
  const secret = value % BN254_FR_MODULUS
  return secret === 0n ? 1n : secret
}

/** The registration id I is the unblinded response of the step 1 (`register` module) evaluation */
export function getRegistrationId(oprfProof: OPRFProof): BabyJubJubPoint {
  return { x: BigInt(oprfProof.response.x), y: BigInt(oprfProof.response.y) }
}

/** Encode a point the way the nodes expect it: decimal strings [x, y] */
export function registrationIdToWire(registrationId: BabyJubJubPoint): [string, string] {
  return [registrationId.x.toString(10), registrationId.y.toString(10)]
}

export type OPRFNodeCallResult = {
  service: string
  ok: boolean
  status?: number
  message?: string
}

export type OPRFNodeCallErrorCode =
  /** Every node rejected with 409: I already registered, or (rotation) commitment used before */
  | "CONFLICT"
  /** Every node rejected with 404: I is not registered */
  | "NOT_FOUND"
  /** The nodes did not all agree, or some failed for another reason. See `results` */
  | "FAILED"

export class OPRFNodeCallError extends Error {
  constructor(
    readonly code: OPRFNodeCallErrorCode,
    readonly results: OPRFNodeCallResult[],
  ) {
    const details = results
      .filter((r) => !r.ok)
      .map((r) => `${r.service}: ${r.status ?? "unreachable"} ${r.message ?? ""}`.trim())
      .join("; ")
    super(`OPRF node call failed (${code}): ${details}`)
    this.name = "OPRFNodeCallError"
  }
}

async function postToAllNodes(
  path: string,
  body: unknown,
  services: string[],
): Promise<OPRFNodeCallResult[]> {
  const payload = JSON.stringify(body)
  const results = await Promise.all(
    services.map(async (service): Promise<OPRFNodeCallResult> => {
      try {
        const response = await fetch(`${service.replace(/\/+$/, "")}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        })
        if (response.ok) return { service, ok: true, status: response.status }
        return { service, ok: false, status: response.status, message: await response.text() }
      } catch (error) {
        return {
          service,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )
  if (results.every((r) => r.ok)) return results
  if (results.every((r) => r.status === 409)) throw new OPRFNodeCallError("CONFLICT", results)
  if (results.every((r) => r.status === 404)) throw new OPRFNodeCallError("NOT_FOUND", results)
  throw new OPRFNodeCallError("FAILED", results)
}

/**
 * Step 2: register the commitment x' for the registration id I at every OPRF node.
 *
 * `proofs` are the 3 base proofs plus the oprf_registration proof for `commitment`.
 * Registration is a write to all nodes, not a threshold: it only succeeds if every node accepts.
 * Throws `OPRFNodeCallError` with code `CONFLICT` if I is already registered (new phone, lost
 * secret, or front-run): the app should then offer a rotation with a face match.
 */
export async function registerAuthCommitment(
  registrationId: BabyJubJubPoint,
  commitment: bigint,
  proofs: ProofResult[],
  services: string[] = OPRF_DEFAULT_SERVICES,
): Promise<OPRFNodeCallResult[]> {
  return postToAllNodes(
    "/api/registration",
    { I: registrationIdToWire(registrationId), commitment: commitment.toString(10), proofs },
    services,
  )
}

/**
 * Step 4: rotate the commitment stored for I to `newCommitment` at every OPRF node.
 *
 * `proofs` are the 3 base proofs, the face-match proof and the oprf_registration proof for
 * `newCommitment`. Throws `OPRFNodeCallError` with code `NOT_FOUND` if I is not registered, and
 * `CONFLICT` if `newCommitment` was used for I before (use a fresh secret).
 */
export async function rotateAuthCommitment(
  registrationId: BabyJubJubPoint,
  newCommitment: bigint,
  proofs: ProofResult[],
  services: string[] = OPRF_DEFAULT_SERVICES,
): Promise<OPRFNodeCallResult[]> {
  return postToAllNodes(
    "/api/rotation",
    { I: registrationIdToWire(registrationId), new_commitment: newCommitment.toString(10), proofs },
    services,
  )
}
