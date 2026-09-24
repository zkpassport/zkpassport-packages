/* eslint-disable @typescript-eslint/no-explicit-any */

import { TwoLetterCode } from ".."

type NISTCurve =
  | { curve: "P-192"; key_size: 192 }
  | { curve: "P-224"; key_size: 224 }
  | { curve: "P-256"; key_size: 256 }
  | { curve: "P-384"; key_size: 384 }
  | { curve: "P-521"; key_size: 521 }

type BrainpoolCurve =
  | { curve: "brainpoolP160r1"; key_size: 160 }
  | { curve: "brainpoolP160t1"; key_size: 160 }
  | { curve: "brainpoolP192r1"; key_size: 192 }
  | { curve: "brainpoolP192t1"; key_size: 192 }
  | { curve: "brainpoolP224r1"; key_size: 224 }
  | { curve: "brainpoolP224t1"; key_size: 224 }
  | { curve: "brainpoolP256r1"; key_size: 256 }
  | { curve: "brainpoolP256t1"; key_size: 256 }
  | { curve: "brainpoolP320r1"; key_size: 320 }
  | { curve: "brainpoolP320t1"; key_size: 320 }
  | { curve: "brainpoolP384r1"; key_size: 384 }
  | { curve: "brainpoolP384t1"; key_size: 384 }
  | { curve: "brainpoolP512r1"; key_size: 512 }
  | { curve: "brainpoolP512t1"; key_size: 512 }

export type ECCurve = NISTCurve | BrainpoolCurve

export type ECPublicKey = ECCurve & {
  type: "EC"
  public_key_x: string
  public_key_y: string
}

export type RSAPublicKey = {
  type: "RSA"
  key_size: number
  modulus: string
  exponent: number
}

export type HashAlgorithm = "SHA-1" | "SHA-224" | "SHA-256" | "SHA-384" | "SHA-512"

export type NISTCurveName = "P-192" | "P-224" | "P-256" | "P-384" | "P-521"

export type BrainpoolCurveName =
  | "brainpoolP160r1"
  | "brainpoolP160t1"
  | "brainpoolP192r1"
  | "brainpoolP192t1"
  | "brainpoolP224r1"
  | "brainpoolP224t1"
  | "brainpoolP256r1"
  | "brainpoolP256t1"
  | "brainpoolP320r1"
  | "brainpoolP320t1"
  | "brainpoolP384r1"
  | "brainpoolP384t1"
  | "brainpoolP512r1"
  | "brainpoolP512t1"

export type CurveName = NISTCurveName | BrainpoolCurveName

export type SignatureAlgorithmType = "RSA" | "RSA-PSS" | "ECDSA"

/**
 * Fields shared by every version of the packaged certificates file format.
 */
type PackagedCertificatesFileBase = {
  // Environment (Omitted for production)
  environment?: string
  // Timestamp when the package was created and the certificates were validated
  timestamp: number
  // Certificate root commitment published to the Certificate Registry, derived as:
  //   certificate_root = H(packed(schema_version | timestamp), state_root)
  //   state_root       = H(certificate_tree_root, revocation_tree_root, masterlist_tree_root)
  // where `schema_version` (2 BE bytes) and `timestamp` (4 BE bytes) are concatenated and
  // packed into a single 31-byte field, and H is Poseidon2.
  // Computed by `calculatePackagedCertificatesRoot`.
  root: string
  // Previous root hash (if any)
  previous_root?: string
  // Array of packaged certificates
  certificates: PackagedCertificate[]
}

/**
 * Packaged certificates file, version 0 (legacy format).
 * The `serialised` field carries the ordered certificate Merkle tree.
 */
export type PackagedCertificatesFileV0 = PackagedCertificatesFileBase & {
  version: 0
  // The serialised ordered Merkle tree of certificates
  // Each row represents a level of the tree, with each entry being a node
  serialised?: string[][]
}

/**
 * Packaged certificates file, version 1.
 * The `serialised` field has been renamed to `certificates_serialised` to
 * disambiguate it from the (separate) revocation and masterlist trees.
 */
export type PackagedCertificatesFileV1 = PackagedCertificatesFileBase & {
  version: 1
  // The serialised ordered Merkle tree of certificates
  // Each row represents a level of the tree, with each entry being a node
  certificates_serialised?: string[][]
  // Array of intermediate certificate revocations (CSCA fingerprint + DSC serial)
  revocations?: IntermediateCertificateRevocation[]
  // The serialised ordered Merkle tree of revocations
  // Each row represents a level of the tree, with each entry being a node
  revocations_serialised?: string[][]
  // Array of masterlist file hashes
  masterlists: string[]
}

/**
 * Discriminated union of all supported packaged certificates file versions.
 * Narrow on `version` to access version-specific fields (e.g. `serialised`
 * vs `certificates_serialised`).
 */
export type PackagedCertificatesFile = PackagedCertificatesFileV0 | PackagedCertificatesFileV1

/**
 * Where one set of sanctions leaves came from: an upstream snapshot (for OpenSanctions, one
 * dataset's `entities.ftm.json` build), identified by its immutable URL, build id and hash.
 * Packaged certificates files record their inputs as a `masterlists` array of leaf hashes; a
 * sanctions snapshot is not itself a leaf, so it is recorded as a structured entry instead.
 */
export type SanctionsSource = {
  /** Upstream dataset name, e.g. an OpenSanctions dataset such as "us_ofac_sdn" */
  dataset: string
  /** Immutable URL of the snapshot that was parsed */
  url: string
  /** Upstream build identifier of the snapshot, e.g. an OpenSanctions build id "20260918081735-mcz" */
  build: string
  /** 0x-prefixed SHA-256 of the downloaded snapshot */
  sha256: string
  /** Size of the downloaded snapshot in bytes */
  size: number
  /**
   * Number of distinct sanctioned persons (upstream entities) in this snapshot that contributed
   * leaves. A person with several name variants counts once.
   */
  entities: number
}

/**
 * Versions of the code that turned the snapshots into leaves and the leaves into a tree, so a
 * packaged sanctions file can be reproduced.
 */
export type PackagedSanctionsBuilder = {
  /** Version of @zkpassport/sanctions, which parses the snapshots and hashes the leaves */
  sanctions_version: string
  /** Version of @zkpassport/utils, which provides poseidon2 and the AsyncOrderedMT tree */
  utils_version: string
  /** Depth of the sanctions tree, as the Sanctions Registry records it in its tree height */
  tree_depth: number
}

/**
 * Packaged sanctions file, version 1: the JSON document published with each sanctions root, whose
 * IPFS CIDv0 the Sanctions Registry stores next to the root. Built and checked by the functions in
 * `registry/sanctions.ts`.
 */
export type PackagedSanctionsFileV1 = {
  version: 1
  /** Unix seconds at which the package was built; also published with the root */
  timestamp: number
  /** Environment label, e.g. "test"; omitted for production */
  environment?: string
  /** Root of the sanctions tree; the value published to the Sanctions Registry */
  root: string
  /** The root this one superseded, if any */
  previous_root?: string
  /**
   * Sorted, unique, non-zero Poseidon2 leaf hashes (0x + 64 hex). AsyncOrderedMT's two sentinel
   * leaves, 0 and its fixed upper bound, are not listed.
   */
  leaves: string[]
  /** One entry per upstream snapshot, sorted by dataset name */
  sources: SanctionsSource[]
  builder: PackagedSanctionsBuilder
  /** Licence attribution of the upstream data */
  attribution: string
}

export type PackagedSanctionsFile = PackagedSanctionsFileV1

export type IntermediateCertificateRevocation = {
  // Fingerprint of the issuing CSCA (Poseidon2 hash of the CSCA DER bytes)
  fingerprint: string
  // Serial number of the revoked intermediate (DSC) certificate
  serial: string
}

export type PackagedCertificate = {
  country: string
  signature_algorithm: SignatureAlgorithmType
  // hash_algorithm: HashAlgorithm
  public_key: ECPublicKey | RSAPublicKey
  validity: {
    not_before: number
    not_after: number
  }
  private_key_usage_period?: {
    not_before?: number
    not_after?: number
  }
  subject_key_identifier?: string
  authority_key_identifier?: string
  fingerprint?: string
  tags?: TwoLetterCode[]
  type?: string
}

export type CircuitManifestEntry = { hash: string; size: number }

export type CircuitManifest = {
  version: string
  root: string
  circuits: Record<string, CircuitManifestEntry>
}
