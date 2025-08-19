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
  passport_no_and_nationality_proof: CircuitSanctionsProof
  name_and_dob_proof: CircuitSanctionsProof
  name_and_yob_proof: CircuitSanctionsProof
}

export type SanctionsOrderedMerkleTreeProofs = {
  passport_no_and_nationality_proof: SortedNonMembershipProof
  name_and_dob_proof: SortedNonMembershipProof
  name_and_yob_proof: SortedNonMembershipProof
}
