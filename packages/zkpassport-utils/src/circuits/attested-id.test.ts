import { describe, expect, test } from "bun:test"
import { sha256 } from "@noble/hashes/sha2.js"
import {
  calculateAttestedDigest,
  calculateAttestedIdCommitment,
  calculateTier2PrivateNullifier,
  getAttestationRevocationProofs,
  getAttestedIdAndroidCircuitName,
  getCertificateSerialNumber,
  getCommitmentOutFromAttestedIdProof,
  getCurrentDateFromAttestedIdProof,
  getExpiryDateFromTd3Dg1,
  getParameterCommitmentFromAttestedIdProof,
} from "./attested-id"
import { getNumberOfPublicInputs } from "./index"

// The sample DG1 of the Noir tests in lib/commitment/attested-to-disclosure: a TD3 passport
// "P<FRADOE<<JANE<<..." for X12345678, born 1990-02-01, expiring 2030-04-03
const DG1 = new Uint8Array([
  97, 91, 95, 31, 88, 80, 60, 70, 82, 65, 68, 79, 69, 60, 60, 74, 65, 78, 69, 60, 60, 60, 60, 60,
  60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60,
  60, 88, 49, 50, 51, 52, 53, 54, 55, 56, 60, 70, 82, 65, 57, 48, 48, 50, 48, 49, 54, 70, 51, 48,
  48, 52, 48, 51, 53, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 48, 52,
])
const PORTRAIT_HASH = sha256(new TextEncoder().encode("portrait"))

// Printed by `nargo test --package attested_to_disclosure_commitment --show-output test_vectors`
const NOIR_PRIVATE_NULLIFIER = 0x2d9b35d7a77a5fc497f5023e755c3aef5ff19bce55ec446597cc3f019b9bcf0fn
const NOIR_REVOCATION_ROOT = "0x0f4a414b270c178520e4b5c640f3be1bb6cd4c13046d097349d9b699bf7334cb"
const NOIR_COMM_OUT = 0x1c724f47ebb528d4842dfa05e05d6502f1f28f7f994b3d7ef079099210621919n

describe("attested id", () => {
  test("attested digest matches the circuit's sha256(dg1 || portrait hash)", () => {
    expect(Array.from(calculateAttestedDigest(DG1, PORTRAIT_HASH))).toEqual([
      69, 31, 10, 65, 229, 106, 116, 253, 122, 216, 15, 84, 46, 167, 26, 217, 239, 248, 239, 198,
      164, 202, 132, 75, 99, 149, 196, 199, 73, 109, 114, 133,
    ])
  })

  test("private nullifier matches the circuit", async () => {
    expect(await calculateTier2PrivateNullifier(DG1)).toBe(NOIR_PRIVATE_NULLIFIER)
  })

  test("private nullifier ignores the name but not the document number", async () => {
    const renamed = Uint8Array.from(DG1)
    renamed[13] = 70 // DOE -> DOF
    const otherNumber = Uint8Array.from(DG1)
    otherNumber[49] = 89 // X -> Y
    expect(await calculateTier2PrivateNullifier(renamed)).toBe(NOIR_PRIVATE_NULLIFIER)
    expect(await calculateTier2PrivateNullifier(otherNumber)).not.toBe(NOIR_PRIVATE_NULLIFIER)
  })

  test("expiry date comes from the MRZ", () => {
    expect(getExpiryDateFromTd3Dg1(DG1)).toBe("300403")
  })

  test("commitment matches the circuit's comm_out", async () => {
    const { commitment, privateNullifier } = await calculateAttestedIdCommitment(
      { dg1Salt: 1n, expiryDateSalt: 2n, dg2HashSalt: 3n, privateNullifierSalt: 4n },
      DG1,
      PORTRAIT_HASH,
    )
    expect(privateNullifier).toBe(NOIR_PRIVATE_NULLIFIER)
    expect(commitment).toBe(NOIR_COMM_OUT)
  })
})

describe("android attested id", () => {
  test("names the circuit after the chain as the circuits repo generates it", () => {
    expect(
      getAttestedIdAndroidCircuitName({
        hardware: false,
        rootType: "rsa",
        intermediates: [
          { type: "ecdsa", bitSize: 256, hashAlgorithm: "sha256" },
          { type: "ecdsa", bitSize: 384, hashAlgorithm: "sha384" },
        ],
      }),
    ).toBe("attested_id_android_rk_rsa_ik_count_2_ik_ecdsa_p256_sha256_ik_ecdsa_p384_sha384")
    expect(
      getAttestedIdAndroidCircuitName({
        hardware: true,
        rootType: "ecdsa",
        intermediates: [{ type: "ecdsa", bitSize: 384, hashAlgorithm: "sha256" }],
      }),
    ).toBe("attested_id_android_hw_rk_ecdsa_ik_count_1_ik_ecdsa_p384_sha256")
  })

  test("reads the outputs after the Android proof's current date", () => {
    const name = "attested_id_android_rk_ecdsa_ik_count_1_ik_ecdsa_p256_sha256"
    expect(getNumberOfPublicInputs(name)).toBe(4)
    expect(getNumberOfPublicInputs("attested_id_ios")).toBe(3)
    const android = { publicInputs: ["0x6900f580", "0xa", "0xb", "0xc9"], proof: [] }
    expect(getCurrentDateFromAttestedIdProof(android)?.toISOString()).toBe(
      "2025-10-28T16:55:28.000Z",
    )
    expect(getCommitmentOutFromAttestedIdProof(android)).toBe(10n)
    expect(getParameterCommitmentFromAttestedIdProof(android)).toBe(11n)
    const ios = { publicInputs: ["0xa", "0xb", "0xc8"], proof: [] }
    expect(getCurrentDateFromAttestedIdProof(ios)).toBeUndefined()
    expect(getCommitmentOutFromAttestedIdProof(ios)).toBe(10n)
  })

  test("proves serials are not revoked, as the circuit's ordered tree takes it", async () => {
    const { root, proofs } = await getAttestationRevocationProofs([5n, 100n], [42n, 7n])
    // Printed by a nargo test computing ordered_mt_compute_root on this proof at depth 20
    expect(root).toBe(NOIR_REVOCATION_ROOT)
    expect(BigInt(proofs[0].left.leaf)).toBe(5n)
    expect(BigInt(proofs[0].right.leaf)).toBe(100n)
    expect(BigInt(proofs[0].right.leaf_index) - BigInt(proofs[0].left.leaf_index)).toBe(1n)
    expect(proofs[0].left.sibling_path).toHaveLength(20)
    await expect(getAttestationRevocationProofs([5n], [5n])).rejects.toThrow("revoked")
    expect(getCertificateSerialNumber(new Uint8Array([0x01, 0x00]))).toBe(256n)
  })
})
