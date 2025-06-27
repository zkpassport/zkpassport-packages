
//////////////// Sanctions
export type SanctionsSparseMerkleTreeProofs = {
  passportNoAndNationalitySMTProof: SanctionsMerkleProof,
  nameAndDobSMTProof: SanctionsMerkleProof,
  nameAndYobSMTProof: SanctionsMerkleProof,
}

export type SanctionsMerkleProof = {
  leaf_value: string
  siblings: string[]
}