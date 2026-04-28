import { NullifierType, ProofData } from "."
import {
  getNullifierTypeFromOuterProof,
  getNullifierFromOuterProof,
  getOprfPkHashFromOuterProof,
  getParamCommitmentsFromOuterProof,
} from "./recursion"

// Trailing public inputs layout (last 3 elements, in order):
//   [length-3] nullifier_type
//   [length-2] scoped_nullifier
//   [length-1] oprf_pk_hash
// Header (first 5 elements) is: certificate_registry_root, circuit_registry_root,
// current_date, service_scope, service_subscope.
// Anything between header and trailing is the param_commitments slice.

function buildProofData(
  paramCommitments: string[],
  nullifierType: bigint,
  scopedNullifier: string,
  oprfPkHash: string,
): ProofData {
  const header = [
    "0x01", // certificate_registry_root
    "0x02", // circuit_registry_root
    "0x03", // current_date
    "0x04", // service_scope
    "0x05", // service_subscope
  ]
  const trailing = [`0x${nullifierType.toString(16)}`, scopedNullifier, oprfPkHash]
  return {
    publicInputs: [...header, ...paramCommitments, ...trailing],
    proof: [],
  }
}

describe("outer proof public inputs", () => {
  const PARAM_COMMITMENTS = ["0xaa", "0xbb", "0xcc"]
  const SCOPED_NULLIFIER = "0xdead"
  const OPRF_PK_HASH = "0xbeef"

  test("getNullifierTypeFromOuterProof reads length-3", () => {
    const cases: Array<[bigint, NullifierType]> = [
      [0n, NullifierType.NON_SALTED],
      [1n, NullifierType.SALTED],
      [2n, NullifierType.NON_SALTED_MOCK],
      [3n, NullifierType.SALTED_MOCK],
    ]
    for (const [raw, expected] of cases) {
      const proof = buildProofData(PARAM_COMMITMENTS, raw, SCOPED_NULLIFIER, OPRF_PK_HASH)
      expect(getNullifierTypeFromOuterProof(proof)).toEqual(expected)
    }
  })

  test("getNullifierTypeFromOuterProof throws on invalid type", () => {
    const proof = buildProofData(PARAM_COMMITMENTS, 4n, SCOPED_NULLIFIER, OPRF_PK_HASH)
    expect(() => getNullifierTypeFromOuterProof(proof)).toThrow("Invalid nullifier type")
  })

  test("getNullifierFromOuterProof reads length-2 (scoped_nullifier, not oprf_pk_hash)", () => {
    const proof = buildProofData(PARAM_COMMITMENTS, 1n, SCOPED_NULLIFIER, OPRF_PK_HASH)
    expect(getNullifierFromOuterProof(proof)).toEqual(BigInt(SCOPED_NULLIFIER))
    expect(getNullifierFromOuterProof(proof)).not.toEqual(BigInt(OPRF_PK_HASH))
  })

  test("getOprfPkHashFromOuterProof reads length-1", () => {
    const proof = buildProofData(PARAM_COMMITMENTS, 1n, SCOPED_NULLIFIER, OPRF_PK_HASH)
    expect(getOprfPkHashFromOuterProof(proof)).toEqual(BigInt(OPRF_PK_HASH))
  })

  test("getParamCommitmentsFromOuterProof excludes all 3 trailing fields", () => {
    const proof = buildProofData(PARAM_COMMITMENTS, 1n, SCOPED_NULLIFIER, OPRF_PK_HASH)
    const result = getParamCommitmentsFromOuterProof(proof)
    expect(result).toEqual(PARAM_COMMITMENTS.map(BigInt))
    expect(result).not.toContain(1n) // nullifier_type
    expect(result).not.toContain(BigInt(SCOPED_NULLIFIER))
    expect(result).not.toContain(BigInt(OPRF_PK_HASH))
  })

  test("getParamCommitmentsFromOuterProof handles empty param commitments", () => {
    const proof = buildProofData([], 0n, SCOPED_NULLIFIER, OPRF_PK_HASH)
    expect(getParamCommitmentsFromOuterProof(proof)).toEqual([])
  })
})
