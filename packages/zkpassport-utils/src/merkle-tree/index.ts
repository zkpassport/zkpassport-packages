import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { normaliseHex } from "../utils"
import { AsyncIMT } from "./async-imt"
import SMT from "./async-smt"

export async function poseidon2(values: any[]) {
  return poseidon2HashAsync(values.map((v) => BigInt(v)))
}

export async function computeMerkleProof(leaves: bigint[], index: number, height: number) {
  if (index < 0 || index >= leaves.length) throw new Error("Invalid index")
  const zeroValue = 0
  const arity = 2
  const tree = new AsyncIMT(poseidon2, height, arity)
  await tree.initialize(zeroValue, leaves)
  const proof = tree.createProof(index)
  return {
    root: normaliseHex(BigInt(proof.root)),
    index: proof.leafIndex,
    path: proof.siblings.flatMap((v) => normaliseHex(BigInt(v))),
  }
}

export { AsyncIMT, SMT }
