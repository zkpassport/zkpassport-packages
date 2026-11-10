import { describe, expect, test } from "bun:test"
import {
  CredentialScheme,
  CredentialTier,
  getAadhaarParameterCommitment,
  getAgeParameterCommitment,
  getFacematchParameterCommitment,
  getServiceScopeHash,
  getServiceSubscopeHash,
  UIDAI_PUBLIC_KEYS,
  type AllowedCredential,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"
import { PublicInputChecker } from "../src/public-input-checker"
import { APPLE_APP_ATTEST_ROOT_KEY_HASH, ZKPASSPORT_IOS_APP_ID_HASH } from "../src/constants"

const DOMAIN = "localhost"
const SCOPE = "age-check"
const COMMITMENT = 0x0a7d0237ba949f4239d663f66399a6cb7cace709f54385d3fb008ed5d22148c3n
const UIDAI_KEY = UIDAI_PUBLIC_KEYS[UIDAI_PUBLIC_KEYS.length - 1].modulus
const OTHER_KEY = "c0".repeat(256)
const FACEMATCH_COMMITTED = {
  rootKeyLeaf: APPLE_APP_ATTEST_ROOT_KEY_HASH,
  environment: "production" as const,
  appIdHash: ZKPASSPORT_IOS_APP_ID_HASH,
  integrityPubkeyHash: "0x0",
  mode: "regular" as const,
}

const field = (x: bigint | number) => BigInt(x).toString(16).padStart(64, "0")
const body = "ab".repeat(32 * 20)

async function proofs({
  key = UIDAI_KEY,
  committedKey = key,
  facematch = true,
}: { key?: string; committedKey?: string; facematch?: boolean } = {}): Promise<ProofResult[]> {
  const now = Math.floor(Date.now() / 1000)
  const scopeHash = getServiceScopeHash(DOMAIN)
  const subscope = getServiceSubscopeHash(SCOPE)
  const disclosure = (name: string, param: bigint, committedInputs: object) => ({
    name,
    version: "0.22.0" as const,
    proof: [COMMITMENT, now, scopeHash, subscope, param, 4, 0, 0].map(field).join("") + body,
    committedInputs,
  })
  const base = {
    name: "aadhaar_id",
    version: "0.22.0",
    proof:
      [COMMITMENT, await getAadhaarParameterCommitment(key), CredentialScheme.UIDAI_AADHAAR]
        .map(field)
        .join("") + body,
    committedInputs: { aadhaar_id: { publicKey: committedKey } },
  }
  const facematchProof = disclosure(
    "facematch",
    await getFacematchParameterCommitment(
      BigInt(FACEMATCH_COMMITTED.rootKeyLeaf),
      1n,
      BigInt(FACEMATCH_COMMITTED.appIdHash),
      1n,
    ),
    { facematch: FACEMATCH_COMMITTED },
  )
  return [
    base,
    disclosure("compare_age", await getAgeParameterCommitment(18, 0), {
      compare_age: { minAge: 18, maxAge: 0 },
    }),
    ...(facematch ? [facematchProof] : []),
  ] as ProofResult[]
}

const query: Query = { age: { gte: 18 } }
const result: QueryResult = { age: { gte: { expected: 18, result: true } } }

async function check(
  bundle: ProofResult[],
  { allowed, devMode = false }: { allowed?: AllowedCredential[]; devMode?: boolean } = {},
) {
  return PublicInputChecker.checkPublicInputs(
    DOMAIN,
    bundle,
    query,
    result,
    undefined,
    SCOPE,
    undefined,
    devMode,
    undefined,
    allowed,
  )
}

describe("Aadhaar proofs", () => {
  test("are accepted as government signed, with a face match and a UIDAI key", async () => {
    const accepted = await check(await proofs())
    expect(accepted.queryResultErrors).toEqual({})
    expect(accepted.isCorrect).toBe(true)
    expect(accepted.credentialScheme).toBe(CredentialScheme.UIDAI_AADHAAR)

    const refused = await check(await proofs(), { allowed: [CredentialTier.DEVICE_ATTESTED] })
    expect(refused.isCorrect).toBe(false)
    expect(refused.queryResultErrors.credential_scheme?.eq?.message).toContain("does not accept")
  })

  test("are refused without a face match", async () => {
    const refused = await check(await proofs({ facematch: false }))
    expect(refused.isCorrect).toBe(false)
    expect(refused.queryResultErrors.facematch?.eq?.message).toContain("face match")
  })

  test("are refused when signed by a key that is not UIDAI's, unless in dev mode", async () => {
    const refused = await check(await proofs({ key: OTHER_KEY }))
    expect(refused.isCorrect).toBe(false)
    expect(refused.queryResultErrors.aadhaar_id?.commitment?.message).toContain("known UIDAI key")

    const dev = await check(await proofs({ key: OTHER_KEY }), { devMode: true })
    expect(dev.queryResultErrors.aadhaar_id).toBeUndefined()
  })

  test("are refused when the committed key is not the one proven with", async () => {
    const refused = await check(await proofs({ key: OTHER_KEY, committedKey: UIDAI_KEY }))
    expect(refused.isCorrect).toBe(false)
    expect(refused.queryResultErrors.aadhaar_id?.commitment?.message).toContain(
      "not made with the key",
    )
  })
})
