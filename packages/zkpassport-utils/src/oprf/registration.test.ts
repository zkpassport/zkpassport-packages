import { afterEach, describe, expect, mock, test } from "bun:test"
import { getNumberOfPublicInputs } from "@/circuits"
import { evaluateMock } from "./mock"
import type { OPRFProof } from "./types"
import {
  OPRFNodeCallError,
  computeAuthCommitment,
  getRegistrationId,
  randomAuthSecret,
  registerAuthCommitment,
  registrationIdToWire,
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

describe("auth commitment", () => {
  test("matches the oprf_registration circuit", () => {
    // Same vector as test_commit_matches_typescript in circuits/src/noir/bin/oprf-registration
    expect(computeAuthCommitment(42n, 1234567890n)).toBe(
      20005179103566317753960723931621279620144361627393651888641707426066443603859n,
    )
  })

  test("binds both the private nullifier and the secret", () => {
    const c = computeAuthCommitment(42n, 1n)
    expect(computeAuthCommitment(42n, 2n)).not.toBe(c)
    expect(computeAuthCommitment(43n, 1n)).not.toBe(c)
    expect(computeAuthCommitment(1n, 42n)).not.toBe(c)
  })

  test("rejects zero or out-of-field inputs", () => {
    expect(() => computeAuthCommitment(0n, 1n)).toThrow()
    expect(() => computeAuthCommitment(42n, 0n)).toThrow()
    expect(() =>
      computeAuthCommitment(
        42n,
        21888242871839275222246405745257275088548364400416034343698204186575808495617n,
      ),
    ).toThrow()
  })

  test("random secrets are nonzero, in field and distinct", () => {
    const a = randomAuthSecret()
    const b = randomAuthSecret()
    expect(a).not.toBe(b)
    for (const s of [a, b]) {
      expect(s > 0n).toBe(true)
      expect(computeAuthCommitment(42n, s) > 0n).toBe(true)
    }
  })
})

describe("registration id", () => {
  test("is the unblinded OPRF response", () => {
    // TACEO's oprf-nr sample proof (input 42), same as the oprf_registration circuit tests
    const sample: OPRFProof = {
      pk: {
        x: "5710999305174746446129006558187982651929018212457711080538180123406991257834",
        y: "14822830093014637273720066510303560520096190665043878041612158237057634974510",
      },
      dlog_e: "21651611782908870028415356680205912578677611779857889287526859934595727462023",
      dlog_s: "813348544856521250944635798658236115440111721634739064595636884345549099749",
      response_blinded: {
        x: "3155679112931956901250628220045483261937665592711481372076828199008185725288",
        y: "2295756075485931574186491588789693245723103184777309603040062940469350270432",
      },
      response: {
        x: "8239981253288452954319423631647803967161484725248664916163883751103616749641",
        y: "10909431257409573621736924846505941126161080693380329853422959666368005023270",
      },
      beta: "63865932500786004558985758765891911620034145599124743624338496685411118977",
    }
    expect(getRegistrationId(sample)).toEqual({
      x: 8239981253288452954319423631647803967161484725248664916163883751103616749641n,
      y: 10909431257409573621736924846505941126161080693380329853422959666368005023270n,
    })
    // hex-encoded proofs, as produced by evaluateOPRF, decode to the same point
    expect(
      getRegistrationId({
        ...sample,
        response: { x: "0x2a", y: "0x10" },
      }),
    ).toEqual({ x: 42n, y: 16n })
  })

  // TODO: unskip once @taceo/oprf-core releases the fix on oprf-client-js main (7fee7d7, #54).
  // oprf-core 0.4.0 derives the scalar field from @noble/curves' babyjubjub order, which noble
  // 2.4.0 changed to the subgroup order, so no blinding factor can be inverted. This test is the
  // regression check for that fix
  test.skip("is deterministic per passport and key, whatever the blinding", async () => {
    const sk = 123456789n
    const r1 = await evaluateMock(42n, sk)
    const r2 = await evaluateMock(42n, sk)
    const r3 = await evaluateMock(43n, sk)
    expect(r1.oprfProof.beta).not.toBe(r2.oprfProof.beta)
    expect(getRegistrationId(r1.oprfProof)).toEqual(getRegistrationId(r2.oprfProof))
    expect(getRegistrationId(r1.oprfProof)).not.toEqual(getRegistrationId(r3.oprfProof))
  })

  test("wire format matches the node: decimal strings [x, y]", () => {
    expect(registrationIdToWire({ x: 0n, y: 1n })).toEqual(["0", "1"])
    expect(registrationIdToWire({ x: 255n, y: 16n })).toEqual(["255", "16"])
  })

  test("oprf_registration has 6 public inputs", () => {
    expect(getNumberOfPublicInputs("oprf_registration")).toBe(6)
    expect(getNumberOfPublicInputs("oprf_auth")).toBe(3)
  })
})

describe("node calls", () => {
  const I = { x: 7n, y: 8n }
  const proofs = [{ name: "oprf_registration", proof: "0x01" }]

  test("registration posts the node's wire format to every node", async () => {
    const calls = mockFetch(() => 200)
    const results = await registerAuthCommitment(I, 42n, proofs, SERVICES)
    expect(results.every((r) => r.ok)).toBe(true)
    expect(calls.map((c) => c.url)).toEqual([
      "https://node0.test/api/registration",
      "https://node1.test/api/registration",
      "https://node2.test/api/registration",
    ])
    expect(calls[0].body).toEqual({ I: ["7", "8"], commitment: "42", proofs })
  })

  test("rotation posts the node's wire format to every node", async () => {
    const calls = mockFetch(() => 200)
    await rotateAuthCommitment(I, 43n, proofs, SERVICES)
    expect(calls[2].url).toBe("https://node2.test/api/rotation")
    expect(calls[2].body).toEqual({ I: ["7", "8"], new_commitment: "43", proofs })
  })

  test("409 from every node is a CONFLICT (already registered)", async () => {
    mockFetch(() => 409)
    const err = await registerAuthCommitment(I, 42n, proofs, SERVICES).catch((e) => e)
    expect(err).toBeInstanceOf(OPRFNodeCallError)
    expect(err.code).toBe("CONFLICT")
  })

  test("404 from every node is NOT_FOUND (rotation for unknown I)", async () => {
    mockFetch(() => 404)
    const err = await rotateAuthCommitment(I, 42n, proofs, SERVICES).catch((e) => e)
    expect(err.code).toBe("NOT_FOUND")
  })

  test("a partial write is FAILED and reports each node", async () => {
    mockFetch((url) => (url.includes("node1") ? 503 : 200))
    const err = await registerAuthCommitment(I, 42n, proofs, SERVICES).catch((e) => e)
    expect(err.code).toBe("FAILED")
    expect(err.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false, true])
    expect(err.results[1].status).toBe(503)
  })
})
