import { describe, expect, test } from "bun:test"
import {
  CredentialScheme,
  CredentialTier,
  getAgeParameterCommitment,
  getDiscloseParameterCommitment,
  getServiceScopeHash,
  getServiceSubscopeHash,
  type AllowedCredential,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"
import { PublicInputChecker } from "../src/public-input-checker"

// The public inputs of an attested ID proof made on a real device, followed by the disclosure
// proofs' public inputs the app would make on top of it (0.22.0 layout, 9 inputs each)
const ATTESTED_PUBLIC_INPUTS =
  "0a7d0237ba949f4239d663f66399a6cb7cace709f54385d3fb008ed5d22148c3107233271e1213147f5e686a1dbf441c4412941c5dfec4a88fe3b335d1ee17720000000000000000000000000000000000000000000000000000000000000002"
const ATTESTED_COMMITTED = {
  rootKeyLeaf: "0x2532418a107c5306fa8308c22255792cf77e4a290cbce8a840a642a3e591340b",
  environment: "production",
  appIdHash: "0x1fa73686cf510f8f85757b0602de0dd72a13e68ae2092462be8b72662e7f179b",
  integrityPubkeyHash: "0x0",
  mode: "strict",
}
const DISCLOSED_BYTES = [
  80, 60, 0, 0, 0, 0, 0, 0, 0, 0, 0, 60, 60, 83, 65, 76, 69, 69, 76, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]
const DISCLOSE_MASK = [
  1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]
const DOMAIN = "localhost"
const SCOPE = "age-check"

const field = (x: bigint | number) => BigInt(x).toString(16).padStart(64, "0")
const body = "ab".repeat(32 * 20)

async function proofs(scheme: CredentialScheme): Promise<ProofResult[]> {
  const comm = BigInt("0x" + ATTESTED_PUBLIC_INPUTS.slice(0, 64))
  const now = Math.floor(Date.now() / 1000)
  const scopeHash = getServiceScopeHash(DOMAIN)
  const subscope = getServiceSubscopeHash(SCOPE)
  const disclosure = (name: string, param: bigint, committedInputs: object) => ({
    name,
    version: "0.22.0" as const,
    proof: [comm, now, scopeHash, subscope, param, 4, 0, 0, scheme].map(field).join("") + body,
    committedInputs,
  })
  // The attested proof states its scheme in its own last public input
  const attestedPublicInputs = ATTESTED_PUBLIC_INPUTS.slice(0, 2 * 64) + field(scheme)
  return [
    {
      name: "attested_id_ios",
      version: "0.22.0",
      proof: attestedPublicInputs + body,
      committedInputs: { attested_id_ios: ATTESTED_COMMITTED },
    },
    disclosure("compare_age", await getAgeParameterCommitment(18, 0), {
      compare_age: { minAge: 18, maxAge: 0 },
    }),
    disclosure(
      "disclose_bytes",
      await getDiscloseParameterCommitment(DISCLOSE_MASK, DISCLOSED_BYTES),
      { disclose_bytes: { disclosedBytes: DISCLOSED_BYTES, discloseMask: DISCLOSE_MASK } },
    ),
  ] as ProofResult[]
}

const query: Query = {
  firstname: { disclose: true },
  document_type: { disclose: true },
  age: { gte: 18 },
}
const result: QueryResult = {
  firstname: { disclose: { result: "SALEEL" } },
  document_type: { disclose: { result: "passport" } },
  age: { gte: { expected: 18, result: true } },
}

async function check(scheme: CredentialScheme, allowed?: AllowedCredential[]) {
  return PublicInputChecker.checkPublicInputs(
    DOMAIN,
    await proofs(scheme),
    query,
    result,
    undefined,
    SCOPE,
    undefined,
    true,
    undefined,
    allowed,
  )
}

describe("credential policy on an attested ID proof", () => {
  test("is refused unless the service opted into device-attested credentials", async () => {
    const refused = await check(CredentialScheme.ATTESTED_CAPTURE_IOS)
    expect(refused.isCorrect).toBe(false)
    expect(refused.queryResultErrors.credential_scheme?.eq?.message).toContain("does not accept")
    expect(refused.credentialScheme).toBe(CredentialScheme.ATTESTED_CAPTURE_IOS)

    const byTier = await check(CredentialScheme.ATTESTED_CAPTURE_IOS, [
      CredentialTier.DEVICE_ATTESTED,
    ])
    expect(byTier.isCorrect).toBe(true)
    expect(byTier.queryResultErrors.credential_scheme).toBeUndefined()

    const byScheme = await check(CredentialScheme.ATTESTED_CAPTURE_IOS, [
      CredentialTier.GOVERNMENT_SIGNED,
      CredentialScheme.ATTESTED_CAPTURE_IOS,
    ])
    expect(byScheme.isCorrect).toBe(true)

    const otherPlatform = await check(CredentialScheme.ATTESTED_CAPTURE_IOS, [
      CredentialScheme.ATTESTED_CAPTURE_ANDROID,
    ])
    expect(otherPlatform.isCorrect).toBe(false)
  })

  test("a disclosure proof must carry the base proof's scheme", async () => {
    const mixed = await proofs(CredentialScheme.ATTESTED_CAPTURE_IOS)
    mixed[1] = (await proofs(CredentialScheme.ICAO_CHIP))[1]
    const checked = await PublicInputChecker.checkPublicInputs(
      DOMAIN,
      mixed,
      query,
      result,
      undefined,
      SCOPE,
      undefined,
      true,
      undefined,
      [CredentialTier.DEVICE_ATTESTED],
    )
    expect(checked.isCorrect).toBe(false)
    expect(checked.queryResultErrors.credential_scheme?.eq?.message).toContain("does not match")
  })
})
