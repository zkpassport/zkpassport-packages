import {
  calculateCircuitRoot,
  CircuitManifest,
  NullifierType,
  poseidon2,
  ProofData,
  ProofResult,
} from "."
import {
  getNullifierTypeFromOuterProof,
  getNullifierFromOuterProof,
  getOprfPkHashFromOuterProof,
  getOuterCircuitInputs,
  getOuterCircuitName,
  getOuterCircuitProof,
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

  test("takes the nullifier fields from the nullifier-carrying proof even when a zero-nullifier proof comes first", () => {
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
      "0x100",
      "0x21",
      "0x22",
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
    expect(inputs.service_scope).toEqual("0x21")
    expect(inputs.service_subscope).toEqual("0x22")
    expect(inputs.current_date).toEqual(0x100)
    expect(inputs.scoped_nullifier).toEqual("0xdead")
    expect(inputs.nullifier_type).toEqual("0x1")
    expect(inputs.oprf_pk_hash).toEqual("0xbeef")
    // The outer circuit's DisclosureProof struct expects [comm_in, nullifier, type, oprf]
    expect(inputs.disclosure_proofs[1].public_inputs).toEqual(["0x0e", "0xdead", "0x1", "0xbeef"])
  })

  test("keeps a zero nullifier and the NONE type when every nullifier is zero", () => {
    const first = makeProof(["0x0e", "0x100", "0x21", "0x22", "0xaa", NONE, "0x0", "0x0"])
    const second = makeProof(["0x0e", "0x100", "0x21", "0x22", "0xbb", NONE, "0x0", "0x0"])
    const inputs = getOuterCircuitInputs(baseProof, chainProof, chainProof, [first, second], "0x0f")
    expect(inputs.service_scope).toEqual("0x21")
    expect(inputs.service_subscope).toEqual("0x22")
    expect(inputs.current_date).toEqual(0x100)
    expect(inputs.scoped_nullifier).toEqual("0x0")
    expect(inputs.nullifier_type).toEqual(NONE)
    expect(inputs.oprf_pk_hash).toEqual("0x0")
  })

  test("keeps the mock type at the top level for zero-nullifier mock proofs", () => {
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
})

describe("getOuterCircuitName", () => {
  test("counts the three base subproofs with the disclosure proofs", () => {
    expect(getOuterCircuitName(1)).toEqual("outer_count_4")
    expect(getOuterCircuitName(2)).toEqual("outer_count_5")
    expect(getOuterCircuitName(10)).toEqual("outer_count_13")
  })

  test("names the EVM outer circuit", () => {
    expect(getOuterCircuitName(2, { evm: true })).toEqual("outer_evm_count_5")
  })

  test("throws for disclosure proof counts no outer circuit takes", () => {
    for (const count of [0, 11, 1.5]) {
      expect(() => getOuterCircuitName(count)).toThrow(
        `No outer circuit for ${count} disclosure proofs: expected 1 to 10`,
      )
    }
  })
})

describe("getOuterCircuitProof", () => {
  const field = (value: number) => value.toString(16).padStart(64, "0")
  // compare_age, like every disclosure circuit, has 8 public inputs
  const PUBLIC_INPUTS = [1, 2, 3, 4, 5, 6, 7, 8].map(field)
  const PROOF_BODY = [0x21, 0x22, 0x23].map(field)
  const VKEY_FIELDS = [0x41, 0x42].map(field)
  const VKEY_HASHES = ["0x0c", "0x0a", "0x0b"]

  const subproof: ProofResult = {
    name: "compare_age",
    proof: [...PUBLIC_INPUTS, ...PROOF_BODY].join(""),
    vkeyHash: "0x0b",
  }
  const circuit = {
    name: "compare_age",
    vkey: Buffer.from(VKEY_FIELDS.join(""), "hex").toString("base64"),
    vkey_hash: "0x0b",
  }

  async function getCircuitManifest(): Promise<CircuitManifest> {
    return {
      version: "0.22.0",
      root: await calculateCircuitRoot({ hashes: VKEY_HASHES }),
      circuits: Object.fromEntries(
        VKEY_HASHES.map((hash, index) => [`circuit_${index}`, { hash, size: 1 }]),
      ),
    }
  }

  test("splits the subproof into public inputs and proof, and the vkey into fields", async () => {
    const outerCircuitProof = await getOuterCircuitProof(
      subproof,
      circuit,
      await getCircuitManifest(),
    )
    expect(outerCircuitProof.publicInputs).toEqual(PUBLIC_INPUTS.map((value) => `0x${value}`))
    expect(outerCircuitProof.proof).toEqual(PROOF_BODY.map((value) => `0x${value}`))
    expect(outerCircuitProof.vkey).toEqual(VKEY_FIELDS.map((value) => `0x${value}`))
    expect(outerCircuitProof.keyHash).toEqual("0x0b")
  })

  test("gives the path from the vkey hash to the manifest's root", async () => {
    const circuitManifest = await getCircuitManifest()
    const { treeIndex, treeHashPath } = await getOuterCircuitProof(
      subproof,
      circuit,
      circuitManifest,
    )
    // The leaves are sorted, so 0x0b is the second one
    expect(treeIndex).toEqual("0x1")

    let node = BigInt(circuit.vkey_hash)
    let index = Number(treeIndex)
    for (const sibling of treeHashPath) {
      node = index % 2 === 0 ? await poseidon2([node, sibling]) : await poseidon2([sibling, node])
      index = Math.floor(index / 2)
    }
    expect(node).toEqual(BigInt(circuitManifest.root))
  })

  test("takes the path from the given function", async () => {
    const outerCircuitProof = await getOuterCircuitProof(
      subproof,
      circuit,
      await getCircuitManifest(),
      async () => ({ root: "0x01", index: 7, path: ["0x02", "0x03"] }),
    )
    expect(outerCircuitProof.treeIndex).toEqual("0x7")
    expect(outerCircuitProof.treeHashPath).toEqual(["0x02", "0x03"])
  })

  test("throws when the manifest does not include the circuit", async () => {
    const otherCircuit = { ...circuit, vkey_hash: "0x0d" }
    await expect(
      getOuterCircuitProof(subproof, otherCircuit, await getCircuitManifest()),
    ).rejects.toThrow("Invalid index")
  })
})
