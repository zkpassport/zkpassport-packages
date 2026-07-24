import { NullifierType, ProofData } from "."
import {
  getNullifierTypeFromOuterProof,
  getNullifierFromOuterProof,
  getOprfPkHashFromOuterProof,
  getOuterCircuitInputs,
  getParamCommitmentsFromOuterProof,
  OuterCircuitProof,
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
      [4n, NullifierType.NONE],
    ]
    for (const [raw, expected] of cases) {
      const proof = buildProofData(PARAM_COMMITMENTS, raw, SCOPED_NULLIFIER, OPRF_PK_HASH)
      expect(getNullifierTypeFromOuterProof(proof)).toEqual(expected)
    }
  })

  test("getNullifierTypeFromOuterProof throws on invalid type", () => {
    const proof = buildProofData(PARAM_COMMITMENTS, 5n, SCOPED_NULLIFIER, OPRF_PK_HASH)
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

describe("getOuterCircuitInputs top-level input derivation", () => {
  // Disclosure proof public inputs layout:
  // [0] comm_in, [1] current_date, [2] service_scope, [3] service_subscope,
  // [4] param_commitment, [5] nullifier_type, [6] scoped_nullifier, [7] oprf_pk_hash
  function makeProof(publicInputs: string[]): OuterCircuitProof {
    return {
      proof: [],
      publicInputs,
      vkey: [],
      keyHash: "0x00",
      treeHashPath: [],
      treeIndex: "0",
    }
  }
  const baseProof = makeProof(["0x0d"])
  const chainProof = makeProof(["0x0d", "0x0e"])
  const NONE = `0x${NullifierType.NONE.toString(16)}`
  const MOCK = `0x${NullifierType.NON_SALTED_MOCK.toString(16)}`

  test("derives from the nullifier-carrying proof when one exists", () => {
    const boundNoNullifier = makeProof([
      "0x0e",
      "0x100",
      "0x21",
      "0x22",
      "0xaa",
      NONE,
      "0x0",
      "0x0",
    ])
    const withNullifier = makeProof([
      "0x0e",
      "0x101",
      "0x23",
      "0x24",
      "0xbb",
      "0x1",
      "0xdead",
      "0xbeef",
    ])
    const inputs = getOuterCircuitInputs(
      baseProof,
      chainProof,
      chainProof,
      [boundNoNullifier, withNullifier],
      "0x0f",
    )
    expect(inputs.service_scope).toEqual("0x23")
    expect(inputs.service_subscope).toEqual("0x24")
    expect(inputs.current_date).toEqual(0x101)
    expect(inputs.scoped_nullifier).toEqual("0xdead")
    expect(inputs.nullifier_type).toEqual("0x1")
    expect(inputs.oprf_pk_hash).toEqual("0xbeef")
  })

  test("falls back to a scope-bound proof when every nullifier is zero (NONE)", () => {
    // e.g. a cached scope-less facematch proof followed by a scope-bound disclosure proof
    const scopeLess = makeProof(["0x0e", "0x90", "0x0", "0x0", "0xaa", NONE, "0x0", "0x0"])
    const bound = makeProof(["0x0e", "0x100", "0x21", "0x22", "0xbb", NONE, "0x0", "0x0"])
    const inputs = getOuterCircuitInputs(
      baseProof,
      chainProof,
      chainProof,
      [scopeLess, bound],
      "0x0f",
    )
    expect(inputs.service_scope).toEqual("0x21")
    expect(inputs.service_subscope).toEqual("0x22")
    expect(inputs.current_date).toEqual(0x100)
    expect(inputs.scoped_nullifier).toEqual("0x0")
    expect(inputs.nullifier_type).toEqual(NONE)
    expect(inputs.oprf_pk_hash).toEqual("0x0")
  })

  test("keeps the mock type at the top level for zero-nullifier mock proofs", () => {
    // A ZKR ID with a hidden private nullifier keeps NON_SALTED_MOCK with a zero nullifier,
    // while its facematch proof emits NONE; the mock type must win at the top level
    const facematch = makeProof(["0x0e", "0x100", "0x21", "0x22", "0xaa", NONE, "0x0", "0x0"])
    const mockBound = makeProof(["0x0e", "0x100", "0x21", "0x22", "0xbb", MOCK, "0x0", "0x0"])
    const inputs = getOuterCircuitInputs(
      baseProof,
      chainProof,
      chainProof,
      [facematch, mockBound],
      "0x0f",
    )
    expect(inputs.nullifier_type).toEqual(MOCK)
    expect(inputs.scoped_nullifier).toEqual("0x0")
  })

  test("throws when there is no nullifier-carrying nor scope-bound proof", () => {
    const scopeLess = makeProof(["0x0e", "0x90", "0x0", "0x0", "0xaa", NONE, "0x0", "0x0"])
    expect(() =>
      getOuterCircuitInputs(baseProof, chainProof, chainProof, [scopeLess], "0x0f"),
    ).toThrow("No disclosure proof with a non-zero nullifier or a bound scope found")
  })
})
