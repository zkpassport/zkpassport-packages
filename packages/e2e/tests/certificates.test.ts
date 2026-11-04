/**
 * Certificates, end to end on a fork of Sepolia, against the certificate root on chain:
 *
 *   SDK request() in dev mode → bridge → headless app proves a passport under each of ZKR's CSCAs
 *   against the certificates packaged for Sepolia's latest certificate root → SDK verify() checks
 *   that root in the Certificate Registry
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import {
  calculatePackagedCertificatesRoot,
  getMerkleRootFromDSCProof,
  getNumberOfPublicInputs,
  getProofData,
  type ProofResult,
} from "@zkpassport/utils"
import { createMockPassport, type MockPassportSignature } from "@zkpassport/utils/mock-passports"
import { startTestEnv, type TestEnv } from "../src/test-env"

const ZKR_CSCAS: { csca: string; signature: MockPassportSignature }[] = [
  { csca: "RSA", signature: "rsa-2048-sha256" },
  { csca: "ECDSA", signature: "ecdsa-p256-sha256" },
]

describe("certificates, end to end on a Sepolia fork", () => {
  let testEnv: TestEnv
  let certificateRoot: string

  beforeAll(async () => {
    testEnv = await startTestEnv()
    certificateRoot = await testEnv.registry.getLatestCertificateRoot()
  }, 60_000)

  afterAll(() => testEnv?.stop())

  for (const { csca, signature } of ZKR_CSCAS) {
    test(`a passport under ZKR's ${csca} CSCA verifies against Sepolia's latest certificate root`, async () => {
      const app = await testEnv.runHeadlessApp({
        passport: createMockPassport({ signature }),
        query: (query) => query.disclose("nationality"),
      })

      const { proofs, result: queryResult } = app.request.result()!
      expect(certificateRootOf(proofs)).toBe(BigInt(certificateRoot))

      const verification = await testEnv.verify({
        proofs,
        queryResult,
        originalQuery: app.request.query,
      })
      expect(verification.verified).toBe(true)
    }, 180_000)
  }

  test("a proof against a certificate root that is not on chain does not verify", async () => {
    const published = await testEnv.registry.getCertificates()
    // ZKR's CSCAs alone: a valid certificate tree whose root was never published
    const unpublished = {
      ...published,
      certificates: published.certificates.filter((certificate) => certificate.country === "ZKR"),
    }
    unpublished.root = await calculatePackagedCertificatesRoot(unpublished)

    const app = await testEnv.runHeadlessApp({
      passport: createMockPassport(),
      query: (query) => query.disclose("nationality"),
      overrides: { certificates: unpublished },
    })

    const { proofs, result: queryResult } = app.request.result()!
    expect(certificateRootOf(proofs)).toBe(BigInt(unpublished.root))

    const verification = await testEnv.verify({
      proofs,
      queryResult,
      originalQuery: app.request.query,
    })
    expect(verification.verified).toBe(false)
    expect(verification.queryResultErrors?.sig_check_dsc?.certificate?.message).toBe(
      "The ID was signed by an unrecognized root certificate",
    )
  }, 180_000)
})

/** The certificate root the DSC proof among `proofs` commits to */
function certificateRootOf(proofs: ProofResult[]): bigint {
  const dscProof = proofs.find((proof) => proof.name?.startsWith("sig_check_dsc"))!
  return getMerkleRootFromDSCProof(
    getProofData(dscProof.proof as string, getNumberOfPublicInputs(dscProof.name!)),
  )
}
