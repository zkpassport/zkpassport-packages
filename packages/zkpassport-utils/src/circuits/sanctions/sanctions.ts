import { PassportViewModel } from "@/types";
import { SanctionsMerkleProof, SanctionsSparseMerkleTreeProofs } from "./types"
import { leftPadArrayWithZeros, packBeBytesIntoField, stringToAsciiStringArray } from "@/utils";
import { sha256 } from "@noble/hashes/sha2"
import { poseidon2, SMT } from "@/merkle-tree";
import { getBirthdateRange, getDocumentNumberRange, getFullNameRange, getNationalityRange } from "@/passport/getters";
import { poseidon2HashAsync } from "@zkpassport/poseidon2";
import { ProofType } from "@/index";

export class SanctionsBuilder {

  constructor(
    private documentNumberAndNationalitySMT: SMT,
    private nameAndDOBSMT: SMT,
    private nameAndYobSMT: SMT
  ) {}

  static async create(): Promise<SanctionsBuilder> {
    const documentNumberAndNationalitySMTData = await import("./trees/passportNoAndCountrySMT.json")
    const nameAndDOBSMTData = await import("./trees/nameAndDobSMT.json")
    const nameAndYobSMTData = await import("./trees/nameAndYobSMT.json")

    const documentNumberAndNationalitySMT = new SMT(poseidon2, true)
    documentNumberAndNationalitySMT.importFromJson(documentNumberAndNationalitySMTData.default)

    const nameAndDOBSMT = new SMT(poseidon2, true)
    nameAndDOBSMT.importFromJson(nameAndDOBSMTData.default)

    const nameAndYobSMT = new SMT(poseidon2, true)
    nameAndYobSMT.importFromJson(nameAndYobSMTData.default)

    return new SanctionsBuilder(documentNumberAndNationalitySMT, nameAndDOBSMT, nameAndYobSMT)
  }

  async getRootHash(): Promise<Buffer> {
    const rootHash = await poseidon2([this.documentNumberAndNationalitySMT.root, this.nameAndDOBSMT.root, this.nameAndYobSMT.root])
    return Buffer.from(rootHash.toString(16), "hex")
  }

  async getSanctionsMerkleProofs(passport: PassportViewModel): Promise<{proofs: SanctionsSparseMerkleTreeProofs, rootHash: string}> {
    const { nameAndDOBHash, nameAndYobHash, documentNumberAndNationalityHash } = await getSanctionsHashesFromIdData(passport);

    const nameAndDOBSMTProof = this.nameAndDOBSMT.createProof(nameAndDOBHash)
    const nameAndYobSMTProof = this.nameAndYobSMT.createProof(nameAndYobHash)
    const documentNumberAndNationalityProof = this.documentNumberAndNationalitySMT.createProof(documentNumberAndNationalityHash)

    const rootHash = await this.getRootHash()

    // Format in a way the circuit expects!
    const nameAndDOBProof: SanctionsMerkleProof = getSanctionsMerkleProof(nameAndDOBSMTProof)
    const nameAndYobProof: SanctionsMerkleProof = getSanctionsMerkleProof(nameAndYobSMTProof)
    const passportAndNationalityProof: SanctionsMerkleProof = getSanctionsMerkleProof(documentNumberAndNationalityProof)

    const proofs: SanctionsSparseMerkleTreeProofs = {
      passportNoAndNationalitySMTProof: passportAndNationalityProof,
      nameAndDobSMTProof: nameAndDOBProof,
      nameAndYobSMTProof: nameAndYobProof,
    }

    return {proofs, rootHash: `0x${rootHash.toString("hex")}`}
  }

  async getSanctionsEvmParameterCommitment(): Promise<bigint> {
    const rootHash = await this.getRootHash()
    const rootHashArr: number[] = Array.from(rootHash).map((x) => Number(x))
    const rootHashNumberArray = leftPadArrayWithZeros(rootHashArr, 32)
    const hash = sha256(new Uint8Array([ProofType.Sanctions_EXCLUSION, ...rootHashNumberArray]))
    const hashBigInt = packBeBytesIntoField(hash, 31)
    return hashBigInt
  }

  async getSanctionsParameterCommitment(): Promise<bigint> {
    const rootHash = await this.getRootHash()
    const rootHashArray = leftPadArrayWithZeros(Array.from(rootHash), 32)
    const rootHashBigIntArray: bigint[] = rootHashArray.map((x) => BigInt(x))
    const hash = await poseidon2HashAsync([BigInt(ProofType.Sanctions_EXCLUSION), ...rootHashBigIntArray])
    return hash
  }

}

function getSanctionsMerkleProof(proof: any): SanctionsMerkleProof {
  // TODO cleanup
  if (proof.membership) {
    console.warn("Sanctions!!!!!!!")
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

async function getSanctionsHashesFromIdData(passport: PassportViewModel): Promise<{
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
