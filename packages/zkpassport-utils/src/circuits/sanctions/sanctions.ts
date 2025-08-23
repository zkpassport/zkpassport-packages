import { PassportViewModel } from "@/types"
import { CircuitSanctionsProof, SanctionsOrderedMerkleTreeProofs, SanctionsProofs } from "./types"
import { leftPadArrayWithZeros, packBeBytesIntoField, stringToAsciiStringArray } from "@/utils"
import { sha256 } from "@noble/hashes/sha2"
import { poseidon2, AsyncOrderedMT } from "@/merkle-tree"
import {
  getBirthdateRange,
  getDocumentNumberRange,
  getFullNameRange,
  getNationalityRange,
} from "@/passport/getters"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { ProofType } from "@/index"

export class SanctionsBuilder {
  constructor(private tree: AsyncOrderedMT) {}

  static async create(): Promise<SanctionsBuilder> {
    const treeData = await import("./trees/Ordered_sanctions.json")

    const tree = await AsyncOrderedMT.fromSerialized(treeData.default, poseidon2)
    return new SanctionsBuilder(tree)
  }

  getRootHash(): Buffer {
    return Buffer.from(this.tree.root.toString(16).padStart(64, "0"), "hex")
  }

  getRoot(): string {
    return `0x${this.tree.root.toString(16).padStart(64, "0")}`
  }

  async getSanctionsMerkleProofs(
    passport: PassportViewModel,
  ): Promise<{ proofs: SanctionsProofs; root: string }> {
    const { nameAndDOBHash, nameAndYobHash, documentNumberAndNationalityHash } =
      await getSanctionsHashesFromIdData(passport)

    const nameAndDobProof = this.tree.createNonMembershipProof(nameAndDOBHash)
    const nameAndYobProof = this.tree.createNonMembershipProof(nameAndYobHash)
    const passportNoAndNationalityProof = this.tree.createNonMembershipProof(
      documentNumberAndNationalityHash,
    )

    const root = this.getRoot()

    const sanctionsProofs: SanctionsOrderedMerkleTreeProofs = {
      passport_no_and_nationality_proof: passportNoAndNationalityProof,
      name_and_dob_proof: nameAndDobProof,
      name_and_yob_proof: nameAndYobProof,
    }

    const proofs: SanctionsProofs = {
      passport_no_and_nationality_proof: formatSanctionsProof(
        sanctionsProofs.passport_no_and_nationality_proof,
      ),
      name_and_dob_proof: formatSanctionsProof(sanctionsProofs.name_and_dob_proof),
      name_and_yob_proof: formatSanctionsProof(sanctionsProofs.name_and_yob_proof),
    }

    return { proofs, root }
  }

  async getSanctionsEvmParameterCommitment(): Promise<bigint> {
    const rootHash = this.getRootHash()

    const rootHashArr: number[] = Array.from(rootHash).map((x) => Number(x))
    const rootHashNumberArray = leftPadArrayWithZeros(rootHashArr, 32)
    const hash = sha256(new Uint8Array([ProofType.SANCTIONS_EXCLUSION, ...rootHashNumberArray]))
    const hashBigInt = packBeBytesIntoField(hash, 31)
    return hashBigInt
  }

  async getSanctionsParameterCommitment(): Promise<bigint> {
    const rootHash = this.getRootHash()
    const rootHashArray = leftPadArrayWithZeros(Array.from(rootHash), 32)
    const rootHashBigIntArray: bigint[] = rootHashArray.map((x) => BigInt(x))
    const hash = await poseidon2HashAsync([
      BigInt(ProofType.SANCTIONS_EXCLUSION),
      ...rootHashBigIntArray,
    ])
    return hash
  }
}

function formatSanctionsProof(proof: SanctionsOrderedMerkleTreeProofs[keyof SanctionsOrderedMerkleTreeProofs]): CircuitSanctionsProof {
  const left = proof.left?.proof
  const right = proof.right?.proof
  return {
    left: {
      leaf: `0x${left?.leaf.toString(16).padStart(64, "0")}`,
      leaf_index: `0x${left?.leafIndex.toString(16).padStart(64, "0")}`,
      sibling_path: left?.siblings.map((x) => `0x${x.toString(16).padStart(64, "0")}`) ?? [],
    },
    right: {
      leaf: `0x${right?.leaf.toString(16).padStart(64, "0")}`,
      leaf_index: `0x${right?.leafIndex.toString(16).padStart(64, "0")}`,
      sibling_path: right?.siblings.map((x) => `0x${x.toString(16).padStart(64, "0")}`) ?? [],
    },
  }
}

async function getSanctionsHashesFromIdData(passport: PassportViewModel): Promise<{
  nameAndDOBHash: bigint
  nameAndYobHash: bigint
  documentNumberAndNationalityHash: bigint
}> {
  const fullNameBytes = stringToAsciiStringArray(passport.mrz.slice(...getFullNameRange(passport)))
  const dateOfBirthBytes = stringToAsciiStringArray(
    passport.mrz.slice(...getBirthdateRange(passport)),
  )
  const documentNumberBytes = stringToAsciiStringArray(
    passport.mrz.slice(...getDocumentNumberRange(passport)),
  )
  const nationalityBytes = stringToAsciiStringArray(
    passport.mrz.slice(...getNationalityRange(passport)),
  )

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
