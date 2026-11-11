import { describe, expect, test } from "bun:test"
import { sha256 } from "@noble/hashes/sha2.js"
import {
  calculateAttestedDigest,
  calculateAttestedIdCommitment,
  calculateTier2PrivateNullifier,
  getAttestedIdAndroidCircuitName,
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
const NOIR_PRIVATE_NULLIFIER = 0x268d201714d4c95b9cbea4ec4910962f6b6239a6011bce1e05ac93d8b3c1130en
const NOIR_ID_CARD_PRIVATE_NULLIFIER =
  0x26494576986dd8b931a4ffefbbc69db50ba5ea8ea8365a477ff2ae4929d9a514n
const NOIR_GERMAN_PRIVATE_NULLIFIER =
  0x2f0450e266d1d32119b119d4123df94b8a657aba866ea56a29a00c43dde26ce6n
const NOIR_LONG_NUMBER_PRIVATE_NULLIFIER =
  0x1802e9c59e5d01ff241800a1f43b8d729bce77c51de38e44a3bfdb0cb669039dn
const NOIR_COMM_OUT = 0x19793a0d17b7a1540fdfda1f64d6e48d4264250003e2a37f6d52a86f6de5e392n

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

  test("private nullifier ignores the name but not the document number or expiry", async () => {
    const renamed = Uint8Array.from(DG1)
    renamed[13] = 70 // DOE -> DOF
    const otherNumber = Uint8Array.from(DG1)
    otherNumber[49] = 89 // X -> Y
    expect(await calculateTier2PrivateNullifier(renamed)).toBe(NOIR_PRIVATE_NULLIFIER)
    expect(await calculateTier2PrivateNullifier(otherNumber)).not.toBe(NOIR_PRIVATE_NULLIFIER)
    const otherExpiry = Uint8Array.from(DG1)
    otherExpiry[71] = 49 // 2030 -> 2031
    expect(await calculateTier2PrivateNullifier(otherExpiry)).not.toBe(NOIR_PRIVATE_NULLIFIER)
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
})
