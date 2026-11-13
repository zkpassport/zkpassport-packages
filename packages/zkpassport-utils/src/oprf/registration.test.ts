import { afterEach, describe, expect, mock, test } from "bun:test"
import { evaluateMock } from "./mock"
import {
  OPRFNodeCallError,
  computeAuthCommitment,
  getRegistrationId,
  registerAuthCommitment,
  rotateAuthCommitment,
} from "./registration"

const SERVICES = ["https://node0.test", "https://node1.test", "https://node2.test/"]
const realFetch = globalThis.fetch

function mockFetch(statusFor: (url: string) => number) {
  const calls: { url: string; body: unknown }[] = []
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) })
    const status = statusFor(String(url))
    return new Response(status === 200 ? null : "nope", { status })
  }) as unknown as typeof fetch
  return calls
}

afterEach(() => {
  globalThis.fetch = realFetch
})

test("auth commitment matches test_commit_matches_typescript in the oprf_registration circuit", () => {
  expect(computeAuthCommitment(42n, 1234567890n)).toBe(
    20721230157314234980082030123557672032448796759570443125008743193036826370715n,
  )
})

// Regression check for the @taceo/oprf-core patch in patches/: without it no blinding factor inverts
test("registration id is deterministic per passport and key, whatever the blinding", async () => {
  const sk = 123456789n
  const r1 = await evaluateMock(42n, sk)
  const r2 = await evaluateMock(42n, sk)
  const r3 = await evaluateMock(43n, sk)
  expect(r1.oprfProof.beta).not.toBe(r2.oprfProof.beta)
  expect(getRegistrationId(r1.oprfProof)).toEqual(getRegistrationId(r2.oprfProof))
  expect(getRegistrationId(r1.oprfProof)).not.toEqual(getRegistrationId(r3.oprfProof))
})

describe("node calls", () => {
  const I = { x: 7n, y: 8n }
  const proofs = [{ name: "oprf_registration", proof: "0x01" }]

  test("post the node's wire format to every node", async () => {
    const calls = mockFetch(() => 200)
    await registerAuthCommitment(I, 42n, proofs, SERVICES)
    await rotateAuthCommitment(I, 43n, proofs, SERVICES)
    expect(calls.map((c) => c.url)).toEqual([
      "https://node0.test/api/registration",
      "https://node1.test/api/registration",
      "https://node2.test/api/registration",
      "https://node0.test/api/rotation",
      "https://node1.test/api/rotation",
      "https://node2.test/api/rotation",
    ])
    expect(calls[0].body).toEqual({ I: ["7", "8"], commitment: "42", proofs })
    expect(calls[3].body).toEqual({ I: ["7", "8"], new_commitment: "43", proofs })
  })

  test("map unanimous 409 / 404 to CONFLICT / NOT_FOUND and anything else to FAILED", async () => {
    mockFetch(() => 409)
    let err = await registerAuthCommitment(I, 42n, proofs, SERVICES).catch((e) => e)
    expect(err).toBeInstanceOf(OPRFNodeCallError)
    expect(err.code).toBe("CONFLICT")

    mockFetch(() => 404)
    err = await rotateAuthCommitment(I, 42n, proofs, SERVICES).catch((e) => e)
    expect(err.code).toBe("NOT_FOUND")

    mockFetch((url) => (url.includes("node1") ? 503 : 200))
    err = await registerAuthCommitment(I, 42n, proofs, SERVICES).catch((e) => e)
    expect(err.code).toBe("FAILED")
    expect(err.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false, true])
  })
})
