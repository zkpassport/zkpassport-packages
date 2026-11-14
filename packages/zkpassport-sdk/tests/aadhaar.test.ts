import { describe, expect, test } from "bun:test"
import {
  CredentialScheme,
  CredentialTier,
  getAgeParameterCommitment,
  getCountryParameterCommitment,
  getFacematchParameterCommitment,
  getServiceScopeHash,
  getServiceSubscopeHash,
  ProofType,
  type Alpha3Code,
  type AllowedCredential,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"
import type { RegistryClient } from "@zkpassport/registry"
import { PublicInputChecker } from "../src/public-input-checker"
import { APPLE_APP_ATTEST_ROOT_KEY_HASH, ZKPASSPORT_IOS_APP_ID_HASH } from "../src/constants"

const DOMAIN = "localhost"
const SCOPE = "age-check"
const COMMITMENT = 0x0a7d0237ba949f4239d663f66399a6cb7cace709f54385d3fb008ed5d22148c3n
const REGISTRY_ROOT = 0x1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a7988n
const OTHER_ROOT = 0x0badn
// Accepts only REGISTRY_ROOT, as the registry would its published roots
const registry = {
  isCertificateRootValid: async (root: string) => BigInt(`0x${root}`) === REGISTRY_ROOT,
  isCircuitRootValid: async () => true,
} as unknown as RegistryClient
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
  root = REGISTRY_ROOT,
  facematch = true,
  excluded,
}: { root?: bigint; facematch?: boolean; excluded?: Alpha3Code[] } = {}): Promise<ProofResult[]> {
  const now = Math.floor(Date.now() / 1000)
  const scopeHash = getServiceScopeHash(DOMAIN)
  const subscope = getServiceSubscopeHash(SCOPE)
  const disclosure = (name: string, param: bigint, committedInputs: object) => ({
    name,
    version: "0.23.0" as const,
    proof: [COMMITMENT, now, scopeHash, subscope, param, 4, 0, 0].map(field).join("") + body,
    committedInputs,
  })
  const base = {
    name: "aadhaar_id",
    version: "0.23.0",
    proof: [root, COMMITMENT, CredentialScheme.UIDAI_AADHAAR].map(field).join("") + body,
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
    ...(excluded
      ? [
          disclosure(
            "exclusion_check_nationality",
            await getCountryParameterCommitment(ProofType.NATIONALITY_EXCLUSION, excluded, true),
            { exclusion_check_nationality: { countries: excluded } },
          ),
        ]
      : []),
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
    registry,
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

  test("are refused when the UIDAI key is not under a Certificate Registry root", async () => {
    const refused = await check(await proofs({ root: OTHER_ROOT }))
    expect(refused.isCorrect).toBe(false)
    expect(refused.queryResultErrors.sig_check_dsc?.certificate?.message).toContain(
      "unrecognized root certificate",
    )
  })

  const checkNationality = async (
    bundle: ProofResult[],
    nationality: Query["nationality"],
    nationalityResult: QueryResult["nationality"],
  ) =>
    PublicInputChecker.checkPublicInputs(
      DOMAIN,
      bundle,
      { ...query, nationality },
      { ...result, nationality: nationalityResult },
      undefined,
      SCOPE,
      undefined,
      false,
      registry,
    )

  test("pass a nationality exclusion check", async () => {
    const accepted = await checkNationality(
      await proofs({ excluded: ["IRN", "PRK"] }),
      { out: ["IRN", "PRK"] },
      { out: { expected: ["IRN", "PRK"], result: true } },
    )
    expect(accepted.queryResultErrors).toEqual({})
    expect(accepted.isCorrect).toBe(true)
  })

  test("are refused for a nationality inclusion check or disclosure", async () => {
    for (const [nationality, nationalityResult] of [
      [{ in: ["IND"] }, { in: { expected: ["IND"], result: true } }],
      [{ eq: "IND" }, { eq: { expected: "IND", result: true } }],
      [{ disclose: true }, { disclose: { result: "IND" } }],
    ] as const) {
      const refused = await checkNationality(
        await proofs(),
        nationality as Query["nationality"],
        nationalityResult as QueryResult["nationality"],
      )
      expect(refused.isCorrect).toBe(false)
      expect(refused.queryResultErrors.nationality?.eq?.message).toBe(
        "An Aadhaar does not prove a nationality, so it can only pass an exclusion check",
      )
    }
  })

  describe("compressed into an outer proof", () => {
    // outer_aadhaar_count_N: [certificate_registry_root, circuit_registry_root, current_date,
    // service_scope, service_subscope, N-1 param commitments, nullifier_type, nullifier,
    // oprf_pk_hash, credential_scheme]
    async function outer({
      root = REGISTRY_ROOT,
      scheme = BigInt(CredentialScheme.UIDAI_AADHAAR),
      facematch = true,
    }: { root?: bigint; scheme?: bigint; facematch?: boolean } = {}): Promise<ProofResult> {
      const age = await getAgeParameterCommitment(18, 0)
      const facematchParam = await getFacematchParameterCommitment(
        BigInt(FACEMATCH_COMMITTED.rootKeyLeaf),
        1n,
        BigInt(FACEMATCH_COMMITTED.appIdHash),
        1n,
      )
      const params = facematch ? [facematchParam, age] : [age]
      return {
        name: `outer_aadhaar_count_${params.length + 1}`,
        version: "0.23.0",
        proof:
          [
            root,
            2n,
            Math.floor(Date.now() / 1000),
            getServiceScopeHash(DOMAIN),
            getServiceSubscopeHash(SCOPE),
            ...params,
            0n,
            42n,
            0n,
            scheme,
          ]
            .map(field)
            .join("") + body,
        committedInputs: {
          ...(facematch ? { facematch: FACEMATCH_COMMITTED } : {}),
          compare_age: { minAge: 18, maxAge: 0 },
        },
      } as ProofResult
    }

    test("are accepted with a face match and a UIDAI key", async () => {
      const accepted = await check([await outer()])
      expect(accepted.queryResultErrors).toEqual({})
      expect(accepted.isCorrect).toBe(true)
      expect(accepted.credentialScheme).toBe(CredentialScheme.UIDAI_AADHAAR)
    })

    test("are refused without a face match", async () => {
      const refused = await check([await outer({ facematch: false })])
      expect(refused.isCorrect).toBe(false)
      expect(refused.queryResultErrors.facematch?.eq?.message).toContain("face match")
    })

    test("are refused when the UIDAI key is not under a Certificate Registry root", async () => {
      const refused = await check([await outer({ root: OTHER_ROOT })])
      expect(refused.isCorrect).toBe(false)
    })

    test("are refused when they state another credential scheme", async () => {
      const refused = await check([await outer({ scheme: 100n })])
      expect(refused.isCorrect).toBe(false)
      expect(refused.queryResultErrors.outer?.certificate?.message).toBe(
        "An Aadhaar outer proof states another credential scheme",
      )
    })
  })
})
