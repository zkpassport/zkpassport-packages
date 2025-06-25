import { PassportViewModel } from "@/types";
import { OFACMerkleProof, OFACSparseMerkleTreeProofs } from "./types"
import { stringToAsciiStringArray } from "@/utils";
import { poseidon2, SMT } from "@/merkle-tree";
import { getBirthdateRange, getDocumentNumberRange, getFullNameRange, getNationalityRange } from "@/passport/getters";

function getOFACMerkleProof(proof: any): OFACMerkleProof {
  // TODO cleanup
  if (proof.membership) {
    console.warn("OFAC!!!!!!!")
  }
  const leaf_value = proof.matchingEntry?.[0] ?? proof.entry[0];
  if (!leaf_value) {
    console.warn("unable to get leaf value")
  }
  const siblings = new Array(254).fill("0x0");
  const proofSiblings = proof.siblings.reverse().map((s: bigint) => `0x${s.toString(16)}`)
  siblings.splice(0, proofSiblings.length, ...proofSiblings);

  return {
    leaf_value: `0x${leaf_value.toString(16)}`,
    siblings: siblings,
  }
}

async function getOFACHashesFromIdData(passport: PassportViewModel): Promise<{
  nameAndDOBHash: bigint,
  nameAndYobHash: bigint,
  documentNumberAndNationalityHash: bigint,
}> {
  const fullNameBytes = stringToAsciiStringArray(passport.mrz.slice(...getFullNameRange(passport)))
  const dateOfBirthBytes = stringToAsciiStringArray(passport.mrz.slice(...getBirthdateRange(passport)))
  const documentNumberBytes = stringToAsciiStringArray(passport.mrz.slice(...getDocumentNumberRange(passport)))
  const nationalityBytes = stringToAsciiStringArray(passport.mrz.slice(...getNationalityRange(passport)))

  const nameAndDOBBytes = [...fullNameBytes, ...dateOfBirthBytes]
  const nameAndYobBytes = [...fullNameBytes, ...dateOfBirthBytes.slice(0, 2)]
  const documentNumberAndNationalityBytes = [...documentNumberBytes, ...nationalityBytes]

  const nameAndDOBHash = await poseidon2(nameAndDOBBytes)
  const nameAndYobHash = await poseidon2(nameAndYobBytes)
  const documentNumberAndNationalityHash = await poseidon2(documentNumberAndNationalityBytes)

  return {
    nameAndDOBHash,
    nameAndYobHash,
    documentNumberAndNationalityHash,
  }
}

export async function getOFACMerkleProofs(passport: PassportViewModel): Promise<OFACSparseMerkleTreeProofs> {
  const { nameAndDOBHash, nameAndYobHash, documentNumberAndNationalityHash } = await getOFACHashesFromIdData(passport);

  // Read the proofs from the trees
  const nameAndDOBSMTData = await import("./trees/nameAndDobSMT.json")
  const nameAndYobSMTData = await import("./trees/nameAndYobSMT.json")
  const documentNumberAndNationalitySMTData = await import("./trees/passportNoAndCountrySMT.json")

  // Create tree objects and load json
  const nameAndDOBSMT = new SMT(poseidon2, true)
  nameAndDOBSMT.importFromJson(nameAndDOBSMTData.default)

  const nameAndYobSMT = new SMT(poseidon2, true)
  nameAndYobSMT.importFromJson(nameAndYobSMTData.default)

  const documentNumberAndNationalitySMT = new SMT(poseidon2, true)
  documentNumberAndNationalitySMT.importFromJson(documentNumberAndNationalitySMTData.default)

  // Create merkle proofs
  const nameAndDOBSMTProof = nameAndDOBSMT.createProof(nameAndDOBHash)
  const nameAndYobSMTProof = nameAndYobSMT.createProof(nameAndYobHash)
  const documentNumberAndNationalityProof = documentNumberAndNationalitySMT.createProof(documentNumberAndNationalityHash)

  // Format in a way the circuit expects!
  const nameAndDOBProof: OFACMerkleProof = getOFACMerkleProof(nameAndDOBSMTProof)
  const nameAndYobProof: OFACMerkleProof = getOFACMerkleProof(nameAndYobSMTProof)
  const passportAndNationalityProof: OFACMerkleProof = getOFACMerkleProof(documentNumberAndNationalityProof)

  const merkleProofs: OFACSparseMerkleTreeProofs = {
    passportNoAndNationalitySMTProof: passportAndNationalityProof,
    nameAndDobSMTProof: nameAndDOBProof,
    nameAndYobSMTProof: nameAndYobProof,
  }

  return merkleProofs
}