import { describe, expect, test } from "bun:test"
import { sha256 } from "@noble/hashes/sha2.js"
import {
  calculateAttestedDigest,
  calculateAttestedIdCommitment,
  calculateTier2PrivateNullifier,
  EMPTY_ATTESTATION_REVOCATION_ROOT,
  getAttestationRevocationProofs,
  getAttestedIdAndroidCircuitName,
  getCertificateSerialNumber,
  getCommitmentOutFromAttestedIdProof,
  getCurrentDateFromAttestedIdProof,
  getExpiryDateFromDg1,
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
const NOIR_PRIVATE_NULLIFIER = 0x1d7dc5da5df5c2bd5557d57aba828043a2b90eaf96d623c0e8ab49720ef7542en
const NOIR_ID_CARD_PRIVATE_NULLIFIER =
  0x2cb827c084093276ffc846f806d1c6b1c27b7fbd0f1ee0008d4778c66b95268an
const NOIR_GERMAN_PRIVATE_NULLIFIER =
  0x1f180760db638ff2c74cb7f862f10f4b19a76b742e307d714ac975acd736a6can
const NOIR_LONG_NUMBER_PRIVATE_NULLIFIER =
  0x065ac3643fddb079f4ba4dc9581aeb6985adeef1e48c2bba91dc5e69da45b8fbn
const NOIR_REVOCATION_ROOT = "0x0f4a414b270c178520e4b5c640f3be1bb6cd4c13046d097349d9b699bf7334cb"
const NOIR_COMM_OUT = 0x2835c00a0035ee2e89cceb33c9f4d08020df39f910b3bb36a1d27bcebc258410n

// The ICAO 9303 sample TD1 ID card "I<UTOD231458907...", born 1974-08-12, expiring 2012-04-15
const ID_CARD_DG1 = new Uint8Array([
  97,
  91,
  95,
  31,
  90,
  ...new TextEncoder().encode(
    "I<UTOD231458907<<<<<<<<<<<<<<<7408122F1204159UTO<<<<<<<<<<<6ERIKSSON<<ANNA<MARIA<<<<<<<<<<",
  ),
])

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

  test("private nullifier reads an ID card and Germany's issuer code as the circuit does", async () => {
    expect(await calculateTier2PrivateNullifier(ID_CARD_DG1)).toBe(NOIR_ID_CARD_PRIVATE_NULLIFIER)
    const german = Uint8Array.from(DG1)
    german.set(new TextEncoder().encode("D<<"), 7)
    expect(await calculateTier2PrivateNullifier(german)).toBe(NOIR_GERMAN_PRIVATE_NULLIFIER)
  })

  test("private nullifier takes a document number continued in the optional data whole", async () => {
    // "D23145890" + "7342", the check digit position left empty (ICAO 9303-5)
    const long = Uint8Array.from(ID_CARD_DG1)
    long.set(new TextEncoder().encode("<7342<"), 5 + 14)
    expect(await calculateTier2PrivateNullifier(long)).toBe(NOIR_LONG_NUMBER_PRIVATE_NULLIFIER)
    const shortWithOptionalData = Uint8Array.from(ID_CARD_DG1)
    shortWithOptionalData[5 + 20] = 65
    expect(await calculateTier2PrivateNullifier(shortWithOptionalData)).toBe(
      NOIR_ID_CARD_PRIVATE_NULLIFIER,
    )
  })

  test("private nullifier ignores the name and expiry, not the document number", async () => {
    const renamed = Uint8Array.from(DG1)
    renamed[13] = 70 // DOE -> DOF
    const otherNumber = Uint8Array.from(DG1)
    otherNumber[49] = 89 // X -> Y
    expect(await calculateTier2PrivateNullifier(renamed)).toBe(NOIR_PRIVATE_NULLIFIER)
    expect(await calculateTier2PrivateNullifier(otherNumber)).not.toBe(NOIR_PRIVATE_NULLIFIER)
    const otherExpiry = Uint8Array.from(DG1)
    otherExpiry[71] = 49 // 2030 -> 2031
    expect(await calculateTier2PrivateNullifier(otherExpiry)).toBe(NOIR_PRIVATE_NULLIFIER)
  })

  test("expiry date comes from the MRZ", () => {
    expect(getExpiryDateFromDg1(DG1)).toBe("300403")
    expect(getExpiryDateFromDg1(ID_CARD_DG1)).toBe("120415")
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
        rootType: "rsa",
        intermediates: [
          { type: "ecdsa", bitSize: 256, hashAlgorithm: "sha256" },
          { type: "ecdsa", bitSize: 384, hashAlgorithm: "sha384" },
        ],
      }),
    ).toBe("attested_id_android_rk_rsa_ik_count_2_ik_ecdsa_p256_sha256_ik_ecdsa_p384_sha384")
  })

  test("reads the attestation's date, then the outputs, on either platform", () => {
    const name = "attested_id_android_rk_ecdsa_ik_count_1_ik_ecdsa_p256_sha256"
    expect(getNumberOfPublicInputs(name)).toBe(4)
    expect(getNumberOfPublicInputs("attested_id_ios")).toBe(4)
    const android = { publicInputs: ["0x6900f580", "0xa", "0xb", "0xc9"], proof: [] }
    expect(getCurrentDateFromAttestedIdProof(android)?.toISOString()).toBe(
      "2025-10-28T16:55:28.000Z",
    )
    expect(getCommitmentOutFromAttestedIdProof(android)).toBe(10n)
    expect(getParameterCommitmentFromAttestedIdProof(android)).toBe(11n)
    // The iOS date is the credential certificate's notBefore day
    const ios = { publicInputs: ["0x69000780", "0xa", "0xb", "0xc8"], proof: [] }
    expect(getCurrentDateFromAttestedIdProof(ios)?.toISOString()).toBe("2025-10-28T00:00:00.000Z")
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

  test("builds the empty revocation tree's root, as the circuit's tests pin it", async () => {
    const { root, proofs } = await getAttestationRevocationProofs([], [1n])
    expect(root).toBe(EMPTY_ATTESTATION_REVOCATION_ROOT)
    expect(BigInt(proofs[0].left.leaf)).toBe(0n)
    expect(proofs[0].right.leaf_index).toBe(`0x${"1".padStart(64, "0")}`)
  })
})
