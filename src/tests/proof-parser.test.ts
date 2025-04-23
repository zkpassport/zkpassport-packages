import { getProofData } from "../proof-parser"
import proofPublicInputs from "./fixtures/proof_public_inputs.json"
import proof from "./fixtures/proof.json"

describe("Proof Parser - Outer Proof - 11 subproofs", () => {
  it("should parse a flattened outer proof", () => {
    // 20 public inputs for the outer proof + 16 field for the aggregation object
    const parsedProof = getProofData(proof.flattened, 36)
    expect(parsedProof.proof).toHaveLength(440)
    expect(parsedProof.proof).toEqual(proof.fields)
    expect(parsedProof.publicInputs).toHaveLength(36)
    expect(parsedProof.publicInputs).toEqual(proofPublicInputs.inputs)
  })
})
