import { PassportViewModel } from "@/types"
import { CircuitSanctionsProof, SanctionsOrderedMerkleTreeProofs, SanctionsProofs } from "./types"
import {
  leftPadArrayWithZeros,
  numberToBytesBE,
  packBeBytesIntoField,
  stringToAsciiStringArray,
  withRetry,
} from "@/utils"
import { sha256 } from "@noble/hashes/sha2"
import { poseidon2, AsyncOrderedMT } from "@/merkle-tree"
import { SortedNonMembershipProof } from "@/merkle-tree/async-ordered-mt"
import {
  getBirthdateRange,
  getDocumentNumberRange,
  getFirstNameRange,
  getFullNameRange,
  getNationality,
  getSecondNameRange,
  getThirdNameRange,
} from "@/passport/getters"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import { ProofType, ProofTypeLength } from "@/index"

export class SanctionsBuilder {
  constructor(private tree: AsyncOrderedMT) {}

  static async create(): Promise<SanctionsBuilder> {
    // TODO: Consider a caching strategy for this
    const treeData = await withRetry(() =>
      fetch("https://cdn.zkpassport.id/sanctions/all_sanctions_tree.json.gz", {
        headers: {
          "Accept-Encoding": "gzip",
        },
      }),
    ).then((res) => res.json())

    const tree = await AsyncOrderedMT.fromSerialized(treeData as string[][], poseidon2)
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
    strict: boolean,
  ): Promise<{ proofs: SanctionsProofs; root: string }> {
    const {
      name1Hash,
      name2Hash,
      name3Hash,
      name1AndDOBHash,
      name2AndDOBHash,
      name3AndDOBHash,
      name1AndYobHash,
      name2AndYobHash,
      name3AndYobHash,
      documentNumberAndNationalityHash,
    } = await getSanctionsHashesFromIdData(passport)

    // If the mode is not strict, we use an "empty" non-membership proof (i.e. proving 1 is not in the tree)
    // just so it doesn't fail cause the person is actually sanctioned by name only
    // while the check is not enabled if not in strict mode
    // The circuit will ignore name proofs when not in strict mode
    const name1Proof = strict
      ? this.tree.createNonMembershipProof(name1Hash)
      : this.tree.createNonMembershipProof(1n)
    const name2Proof = strict
      ? this.tree.createNonMembershipProof(name2Hash)
      : this.tree.createNonMembershipProof(1n)
    const name3Proof = strict
      ? this.tree.createNonMembershipProof(name3Hash)
      : this.tree.createNonMembershipProof(1n)

    const name1AndDobProof = this.tree.createNonMembershipProof(name1AndDOBHash)
    const name2AndDobProof = this.tree.createNonMembershipProof(name2AndDOBHash)
    const name3AndDobProof = this.tree.createNonMembershipProof(name3AndDOBHash)
    const name1AndYobProof = this.tree.createNonMembershipProof(name1AndYobHash)
    const name2AndYobProof = this.tree.createNonMembershipProof(name2AndYobHash)
    const name3AndYobProof = this.tree.createNonMembershipProof(name3AndYobHash)
    const passportNoAndNationalityProof = this.tree.createNonMembershipProof(
      documentNumberAndNationalityHash,
    )

    const root = this.getRoot()

    const sanctionsProofs: SanctionsOrderedMerkleTreeProofs = {
      name_proofs: [name1Proof, name2Proof, name3Proof],
      name_and_dob_proofs: [name1AndDobProof, name2AndDobProof, name3AndDobProof],
      name_and_yob_proofs: [name1AndYobProof, name2AndYobProof, name3AndYobProof],
      passport_no_and_nationality_proof: passportNoAndNationalityProof,
    }

    const proofs: SanctionsProofs = {
      name_proofs: sanctionsProofs.name_proofs.map((proof) => formatSanctionsProof(proof)),
      name_and_dob_proofs: sanctionsProofs.name_and_dob_proofs.map((proof) =>
        formatSanctionsProof(proof),
      ),
      name_and_yob_proofs: sanctionsProofs.name_and_yob_proofs.map((proof) =>
        formatSanctionsProof(proof),
      ),
      passport_no_and_nationality_proof: formatSanctionsProof(
        sanctionsProofs.passport_no_and_nationality_proof,
      ),
    }

    return { proofs, root }
  }

  async getSanctionsEvmParameterCommitment(isStrict: boolean): Promise<bigint> {
    const rootHash = this.getRootHash()

    const rootHashArr: number[] = Array.from(rootHash).map((x) => Number(x))
    const rootHashNumberArray = leftPadArrayWithZeros(rootHashArr, 32)
    const hash = sha256(
      new Uint8Array([
        ProofType.SANCTIONS_EXCLUSION,
        ...numberToBytesBE(ProofTypeLength[ProofType.SANCTIONS_EXCLUSION].evm, 2),
        ...rootHashNumberArray,
        isStrict ? 1 : 0,
      ]),
    )
    const hashBigInt = packBeBytesIntoField(hash, 31)
    return hashBigInt
  }

  async getSanctionsParameterCommitment(isStrict: boolean): Promise<bigint> {
    const rootHash = this.getRootHash()
    const hash = await poseidon2HashAsync([
      BigInt(ProofType.SANCTIONS_EXCLUSION),
      BigInt(ProofTypeLength[ProofType.SANCTIONS_EXCLUSION].standard),
      BigInt(`0x${rootHash.toString("hex")}`),
      isStrict ? 1n : 0n,
    ])
    return hash
  }
}

function formatSanctionsProof(proof: SortedNonMembershipProof): CircuitSanctionsProof {
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

export function processName(name: string): string {
  let formattedName = name
  // Gets the index of the full name separator (<<)
  let fullNameEndIndex = name.match(/[A-Z]<<[A-Z]/)?.index ?? -1
  // If no full name separator is found, get the index of the first singular separator (<)
  if (fullNameEndIndex < 0) {
    fullNameEndIndex = name.match(/[A-Z]<[A-Z]/)?.index ?? -1
    // Replace the singular separator with the full name separator
    if (fullNameEndIndex >= 0) {
      formattedName =
        // Make sure to drop the last character of the name to keep the same length
        name.slice(0, fullNameEndIndex + 1) + "<<" + name.slice(fullNameEndIndex + 2, -1)
    }
  }
  return formattedName
}

export function getNameCombinations(passport: PassportViewModel): string[] {
  const [fullNameStartIndex, fullNameEndIndex] = getFullNameRange(passport)
  let firstNameEndIndex = Math.min(getFirstNameRange(passport)[1], fullNameEndIndex)
  if (firstNameEndIndex < 0) {
    firstNameEndIndex = fullNameEndIndex
  }
  const name1 = passport.mrz.slice(fullNameStartIndex, firstNameEndIndex).padEnd(39, "<")
  let secondNameEndIndex =
    firstNameEndIndex === fullNameEndIndex
      ? fullNameEndIndex
      : Math.min(getSecondNameRange(passport)[1], fullNameEndIndex)
  if (secondNameEndIndex < 0) {
    secondNameEndIndex = fullNameEndIndex
  }
  const name2 = passport.mrz.slice(fullNameStartIndex, secondNameEndIndex).padEnd(39, "<")
  let thirdNameEndIndex =
    secondNameEndIndex === fullNameEndIndex
      ? fullNameEndIndex
      : Math.min(getThirdNameRange(passport)[1], fullNameEndIndex)
  if (thirdNameEndIndex < 0) {
    thirdNameEndIndex = fullNameEndIndex
  }
  const name3 = passport.mrz.slice(fullNameStartIndex, thirdNameEndIndex).padEnd(39, "<")
  return [processName(name1), processName(name2), processName(name3)]
}

async function getSanctionsHashesFromIdData(passport: PassportViewModel): Promise<{
  name1Hash: bigint
  name2Hash: bigint
  name3Hash: bigint
  name1AndDOBHash: bigint
  name1AndYobHash: bigint
  name2AndDOBHash: bigint
  name2AndYobHash: bigint
  name3AndDOBHash: bigint
  name3AndYobHash: bigint
  documentNumberAndNationalityHash: bigint
}> {
  const [name1, name2, name3] = getNameCombinations(passport)

  const name1Bytes = stringToAsciiStringArray(name1)
  const name2Bytes = stringToAsciiStringArray(name2)
  const name3Bytes = stringToAsciiStringArray(name3)

  const name1Hash = await poseidon2(name1Bytes)
  const name2Hash = await poseidon2(name2Bytes)
  const name3Hash = await poseidon2(name3Bytes)

  const dateOfBirthBytes = stringToAsciiStringArray(
    passport.mrz.slice(...getBirthdateRange(passport)),
  )
  const documentNumberBytes = stringToAsciiStringArray(
    passport.mrz.slice(...getDocumentNumberRange(passport)),
  )
  const nationalityBytes = stringToAsciiStringArray(getNationality(passport))

  const name1AndDOBBytes = [...name1Bytes, ...dateOfBirthBytes]
  const name1AndYobBytes = [...name1Bytes, ...dateOfBirthBytes.slice(0, 2)]
  const name2AndDOBBytes = [...name2Bytes, ...dateOfBirthBytes]
  const name2AndYobBytes = [...name2Bytes, ...dateOfBirthBytes.slice(0, 2)]
  const name3AndDOBBytes = [...name3Bytes, ...dateOfBirthBytes]
  const name3AndYobBytes = [...name3Bytes, ...dateOfBirthBytes.slice(0, 2)]
  const documentNumberAndNationalityBytes = [...documentNumberBytes, ...nationalityBytes]

  const name1AndDOBHash = await poseidon2(name1AndDOBBytes)
  const name1AndYobHash = await poseidon2(name1AndYobBytes)
  const name2AndDOBHash = await poseidon2(name2AndDOBBytes)
  const name2AndYobHash = await poseidon2(name2AndYobBytes)
  const name3AndDOBHash = await poseidon2(name3AndDOBBytes)
  const name3AndYobHash = await poseidon2(name3AndYobBytes)
  const documentNumberAndNationalityHash = await poseidon2(documentNumberAndNationalityBytes)

  return {
    name1Hash,
    name2Hash,
    name3Hash,
    name1AndDOBHash,
    name1AndYobHash,
    name2AndDOBHash,
    name2AndYobHash,
    name3AndDOBHash,
    name3AndYobHash,
    documentNumberAndNationalityHash,
  }
}
