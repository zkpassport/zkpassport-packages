import { getProofData } from "../src/proof-parser"
import proofPublicInputs from "./fixtures/proof_public_inputs.json"
import proof from "./fixtures/proof.json"

describe("Proof Parser - Outer Proof - 11 subproofs", () => {
  it("should parse a flattened outer proof", () => {
    // 20 public inputs for the outer proof
    const parsedProof = getProofData(proof.flattened, 15)
    // 456 fields as the outer proof is non-ZK unlike the subproofs
    expect(parsedProof.proof).toHaveLength(456)
    expect(parsedProof.proof).toEqual(proof.fields)
    expect(parsedProof.publicInputs).toHaveLength(15)
    expect(parsedProof.publicInputs).toEqual(proofPublicInputs.inputs)
  })
})
