import { SortedNonMembershipProof } from "@/merkle-tree/async-ordered-mt"

//////////////// Sanctions
export type SanctionsInclusionProof = {
  leaf: string
  leaf_index: string
  sibling_path: string[]
}

export type CircuitSanctionsProof = {
  left: SanctionsInclusionProof
  right: SanctionsInclusionProof
}

export type SanctionsProofs = {
  name_proofs: CircuitSanctionsProof[]
  passport_no_and_nationality_proof: CircuitSanctionsProof
  name_and_dob_proofs: CircuitSanctionsProof[]
  name_and_yob_proofs: CircuitSanctionsProof[]
}

export type SanctionsOrderedMerkleTreeProofs = {
  name_proofs: SortedNonMembershipProof[]
  passport_no_and_nationality_proof: SortedNonMembershipProof
  name_and_dob_proofs: SortedNonMembershipProof[]
  name_and_yob_proofs: SortedNonMembershipProof[]
}
