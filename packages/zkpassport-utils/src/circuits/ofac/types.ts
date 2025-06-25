
//////////////// OFAC
export type OFACSparseMerkleTreeProofs = {
  passportNoAndNationalitySMTProof: OFACMerkleProof[],
  nameAndDobSMTProof: OFACMerkleProof[],
  nameAndYobSMTProof: OFACMerkleProof[],
}

export type OFACMerkleProof = {
  leaf_value: string
  siblings: string[]
}