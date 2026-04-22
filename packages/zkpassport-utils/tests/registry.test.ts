import {
  calculateCircuitRoot,
  CERT_TYPE_DSC,
  getCertificateLeafHash,
  tagsArrayToBitsFlag,
  bitsFlagToTagsArray,
  calculatePackagedCertificatesRoot,
  buildMerkleTreeFromCerts,
  buildMerkleTreeFromRevocations,
  buildMerkleTreeFromMasterlists,
  createPackagedCertificatesFile,
  getRevocationLeafHash,
  getRevocationLeafHashes,
  REVOCATION_MERKLE_TREE_HEIGHT,
  MASTERLIST_MERKLE_TREE_HEIGHT,
} from "../src/registry"
import { AsyncIMT, poseidon2 } from "../src/merkle-tree"
import {
  IntermediateCertificateRevocation,
  PackagedCertificate,
  PackagedCertificatesFile,
  PackagedCertificatesFileV1,
} from "../src/types"
import rootCerts from "./fixtures/root-certs.json"
import rootCertsV1 from "./fixtures/root-certs-v1.json"
import circuitManifest from "./fixtures/manifest.json"

describe("Registry", () => {
  const rsaCert: PackagedCertificate = {
    country: "XYZ",
    signature_algorithm: "RSA",
    public_key: {
      type: "RSA",
      modulus:
        "0x9fc356d37179e527f8b6f40c93628df420ec32d781ade2611e67e3e501f84635860f0c7e5e2b069990ccc6e92509f0950a06ca955f69625ac7da788003d29d726ff9f00a97ffd562d24b3c9c491463583e09bde83f4959651d10295ad2c83ec2d7dd5df7f7800235eb62095950af9cab67f5cd7a8a70f72536190ea686fd7b6f5094b3cee4d9667e4e9924a554839f9ec50bd2188de40c84ba89ee1c3b5f1c2cbd2b55d1bc279d1642e1caf39762fcffd4bd68d73197ce10f4548afee8c0a6794b3f6764263cc879457020da8f0674d0bd8e79731b8c37defd62d2b318cf44b72f0ca3540fb09ee412738fe120337cf604c20236121fb22e91e5e9b1bb73d682e257adf9fa615b26a24b10d7178a7651aef9ec448b9f07beac7c58916cc92064cf4b3feddd6b7fc151aa1975deabf81b6bf439f0b52ed1bd2f7b8e151d19c235a068b34cabadfdd10decd22e178b3cac93c68e376523b6ba99792a29240a2cf44e3e4c6b3e4a9db53ea89e11e62d103b933771723bc87a8e58ecc8439d4dc99b014206a452b2d64ee8afc284799912bb6a8e0f9cc936628c7af7b2b4f9809c20b8c1101461408b6eac5e0519d6c6bd5bed931761e34c0da2b909e87d3034c1ea40a95026fddc7ddcb155f586ec514e04a5413f7d52fc08f4063bd69cc673ad5d3ef5ad4750a7542ae31b576baebd27c43453daf7895312bb95dfc3ded41d06b5",
      exponent: 65537,
      key_size: 4096,
    },
    validity: {
      not_before: 1000000000,
      not_after: 2000000000,
    },
    private_key_usage_period: {
      not_before: 1000000000,
      not_after: 2000000000,
    },
    subject_key_identifier: "0x1111",
    authority_key_identifier: "0x2222",
    fingerprint: "0x0111111111111111111111111111111111111111111111111111111111111111",
    tags: ["UN", "DE"],
  }

  const ecdsaCert: PackagedCertificate = {
    country: "XYZ",
    signature_algorithm: "ECDSA",
    public_key: {
      type: "EC",
      curve: "P-384",
      public_key_x:
        "0x79de28b1dd437cfa696542d4dc0efa49f0e1deff5cdd00a871da06d93be469b90a02d0613959e72ac4b16d45ffd70f83",
      public_key_y:
        "0x6cf6214443e2551171317c02b555afda6257869b4ca9dbea220113eff4d5d554a65f69ba4a726fef84594ae3453e6b95",
      key_size: 384,
    },
    validity: {
      not_before: 1000000000,
      not_after: 2000000000,
    },
    private_key_usage_period: {
      not_before: 1000000000,
      not_after: 2000000000,
    },
    subject_key_identifier: "0x1111",
    authority_key_identifier: "0x2222",
    fingerprint: "0x0222222222222222222222222222222222222222222222222222222222222222",
    tags: ["UN", "DE"],
  }

  test("should generate correct bits flag for tags array", () => {
    expect(tagsArrayToBitsFlag([])).toEqual([0n, 0n, 0n])
    expect(tagsArrayToBitsFlag(["AA"])).toEqual([1n, 0n, 0n])
    expect(tagsArrayToBitsFlag(["AB"])).toEqual([2n, 0n, 0n])
    expect(tagsArrayToBitsFlag(["AA", "AB"])).toEqual([3n, 0n, 0n])
    expect(tagsArrayToBitsFlag(["AC"])).toEqual([4n, 0n, 0n])
    expect(tagsArrayToBitsFlag(["AA", "AB", "AC"])).toEqual([7n, 0n, 0n])

    expect(tagsArrayToBitsFlag(["JR", "JS", "JV"])).toEqual([
      BigInt("0x1800000000000000000000000000000000000000000000000000000000000000"),
      4n,
      0n,
    ])

    expect(tagsArrayToBitsFlag(["UN"])).toEqual([0n, 0n, BigInt("0x8000000")])
  })

  test("should generate correct tags array for bits flag", () => {
    expect(bitsFlagToTagsArray([0n, 0n, 0n])).toEqual([])
    expect(bitsFlagToTagsArray([1n, 0n, 0n])).toEqual(["AA"])
    expect(bitsFlagToTagsArray([2n, 0n, 0n])).toEqual(["AB"])
    expect(bitsFlagToTagsArray([3n, 0n, 0n])).toEqual(["AA", "AB"])
    expect(bitsFlagToTagsArray([4n, 0n, 0n])).toEqual(["AC"])
    expect(bitsFlagToTagsArray([7n, 0n, 0n])).toEqual(["AA", "AB", "AC"])

    expect(
      bitsFlagToTagsArray([
        BigInt("0x1800000000000000000000000000000000000000000000000000000000000000"),
        4n,
        0n,
      ]),
    ).toEqual(["JR", "JS", "JV"])

    expect(bitsFlagToTagsArray([0n, 0n, BigInt("0x8000000")])).toEqual(["UN"])
  })

  test("should generate correct canonical leaf for RSA cert (version 0)", async () => {
    const leaf = await getCertificateLeafHash(rsaCert)
    expect(leaf).toEqual(
      10374427192692971605115852434399434992383543572583326103540359782862263554570n,
    )
  })

  test("should generate correct canonical leaf for ECDSA cert (version 0)", async () => {
    const leaf = await getCertificateLeafHash(ecdsaCert)
    expect(leaf).toEqual(
      9676427500440764140387924904666461180023752817896651616722688209534314347621n,
    )
  })

  test("should generate correct canonical leaf for different publisher and type (version 0)", async () => {
    const leaf = await getCertificateLeafHash(rsaCert, {
      tags: ["UN"],
      type: CERT_TYPE_DSC,
    })
    expect(leaf).toEqual(
      11128308501821901519857638506584544607455540416838544782901445271440127884577n,
    )
  })

  test("should generate correct canonical certificate root (version 0)", async () => {
    const root = await calculatePackagedCertificatesRoot({
      version: 0,
      timestamp: 0,
      root: "",
      certificates: rootCerts.certificates as PackagedCertificate[],
    })
    expect(root).toEqual("0x03c239fdfafd89a568efac9175c32b998e208c4ab453d3615a31c83e65c90686")
  })

  test("should generate correct canonical leaf for RSA cert (version 1)", async () => {
    const leaf = await getCertificateLeafHash(rsaCert, { version: 1 })
    expect(leaf).toEqual(
      18821076869038301219571401322686721036085203437552110369443322053623613446966n,
    )
  })

  test("should generate correct canonical leaf for ECDSA cert (version 1)", async () => {
    const leaf = await getCertificateLeafHash(ecdsaCert, { version: 1 })
    expect(leaf).toEqual(
      14965224189996577667331983147414903016849320294809859715118036488072996530241n,
    )
  })

  test("should generate correct canonical leaf for different publisher and type (version 1)", async () => {
    const leaf = await getCertificateLeafHash(rsaCert, {
      version: 1,
      tags: ["UN"],
      type: CERT_TYPE_DSC,
    })
    expect(leaf).toEqual(
      17732559635977458050578953956465414663427303613303769254065708457591008172683n,
    )
  })

  test("should generate correct canonical certificate root (version 1)", async () => {
    const root = await calculatePackagedCertificatesRoot(rootCertsV1 as PackagedCertificatesFile)
    expect(root).toEqual("0x23e802a448e80b578b81ed587e325cd0dcfb0dac0e6cc6dd6464012fdcdcfd2d")
  })

  test("should produce a different root when the timestamp changes", async () => {
    const base = rootCertsV1 as PackagedCertificatesFile
    const original = await calculatePackagedCertificatesRoot(base)
    const bumped = await calculatePackagedCertificatesRoot({
      ...base,
      timestamp: (base.timestamp ?? 0) + 1,
    })
    expect(bumped).not.toEqual(original)
    expect(bumped).toEqual("0x249e47097c0687530399eb710b72fe55575c2bda4999fcaa4f7bb2ebb2b3e0e3")
  })

  test("should generate correct canonical empty revocation merkle root", async () => {
    expect(REVOCATION_MERKLE_TREE_HEIGHT).toEqual(14)
    const tree = await buildMerkleTreeFromRevocations([])
    expect(tree.root).toEqual("0x0197f2171ef99c2d053ee1fb5ff5ab288d56b9b41b4716c9214a4d97facc4c4a")
  })

  test("should generate correct canonical empty masterlist merkle root", async () => {
    expect(MASTERLIST_MERKLE_TREE_HEIGHT).toEqual(8)
    const tree = await buildMerkleTreeFromMasterlists([])
    expect(tree.root).toEqual("0x067243231eddf4222f3911defbba7705aff06ed45960b27f6f91319196ef97e1")
  })

  test("should generate correct canonical leaf for a revocation", async () => {
    const leaf = await getRevocationLeafHash({
      fingerprint: "0x0111111111111111111111111111111111111111111111111111111111111111",
      serial: "0x123456789",
    })
    expect(leaf).toEqual(
      13990255848651186378069007785567735998009942597416055104842294652882335587883n,
    )
  })

  test("should generate correct canonical masterlist merkle root for sample hashes", async () => {
    const tree = await buildMerkleTreeFromMasterlists([
      "0x0111111111111111111111111111111111111111111111111111111111111111",
      "0x0222222222222222222222222222222222222222222222222222222222222222",
      "0x0333333333333333333333333333333333333333333333333333333333333333",
    ])
    expect(tree.root).toEqual("0x1774e846051ef6eb05fa02a96e571659a3a0fbca6885136d4ee4012276453795")
  })

  test("should generate correct canonical circuit root", async () => {
    const hashes = Object.values(circuitManifest.circuits).map((circuit) => circuit.hash)
    const root = await calculateCircuitRoot({ hashes })
    expect(root).toEqual(circuitManifest.root)
  })

  test("createPackagedCertificatesFile should produce a v1 file matching the fixture", async () => {
    const fixture = rootCertsV1 as PackagedCertificatesFileV1
    const file = await createPackagedCertificatesFile({
      timestamp: fixture.timestamp,
      certificates: fixture.certificates,
      masterlists: fixture.masterlists,
      revocations: fixture.revocations ?? [],
    })

    expect(file.version).toEqual(1)
    expect(file.timestamp).toEqual(fixture.timestamp)
    expect(file.root).toEqual("0x23e802a448e80b578b81ed587e325cd0dcfb0dac0e6cc6dd6464012fdcdcfd2d")
    expect(file.root).toEqual(fixture.root)
    expect(file.certificates).toBe(fixture.certificates)
    expect(file.masterlists).toEqual(fixture.masterlists)
    expect(file.revocations).toEqual(fixture.revocations ?? [])
    expect(file.certificates_serialised).toEqual(fixture.certificates_serialised)
    // Empty revocations tree's top row is the canonical empty revocation merkle root
    expect(file.revocations_serialised?.[file.revocations_serialised.length - 1]?.[0]).toEqual(
      "0x0197f2171ef99c2d053ee1fb5ff5ab288d56b9b41b4716c9214a4d97facc4c4a",
    )
    // The factory output round-trips through calculatePackagedCertificatesRoot
    const recomputed = await calculatePackagedCertificatesRoot(file)
    expect(recomputed).toEqual(file.root)
    // Optional fields are omitted when not provided
    expect(file.previous_root).toBeUndefined()
    expect(file.environment).toBeUndefined()
  })

  test("createPackagedCertificatesFile should respect optional fields and non-empty revocations", async () => {
    const fixture = rootCertsV1 as PackagedCertificatesFileV1
    const revocations = [
      {
        fingerprint: "0x0111111111111111111111111111111111111111111111111111111111111111",
        serial: "0x123456789",
      },
    ]
    const file = await createPackagedCertificatesFile({
      timestamp: fixture.timestamp,
      certificates: fixture.certificates,
      masterlists: fixture.masterlists,
      revocations,
      previous_root: "0x0aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
      environment: "test",
    })

    expect(file.previous_root).toEqual(
      "0x0aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899",
    )
    expect(file.environment).toEqual("test")
    expect(file.revocations).toEqual(revocations)
    // Adding revocations must change the canonical root
    expect(file.root).not.toEqual(fixture.root)
    // The factory output round-trips through calculatePackagedCertificatesRoot
    const recomputed = await calculatePackagedCertificatesRoot(file)
    expect(recomputed).toEqual(file.root)
  })

  test("buildMerkleTreeFromCerts should produce the canonical v0 root", async () => {
    const tree = await buildMerkleTreeFromCerts(rootCerts.certificates as PackagedCertificate[], 0)
    expect(tree.root).toEqual("0x03c239fdfafd89a568efac9175c32b998e208c4ab453d3615a31c83e65c90686")
  })

  test("buildMerkleTreeFromCerts should produce the canonical v1 root and serialised tree", async () => {
    const fixture = rootCertsV1 as PackagedCertificatesFileV1
    const tree = await buildMerkleTreeFromCerts(fixture.certificates, 1)
    expect(tree.root).toEqual("0x2b49d7ddaec2fa540efec3311af6223cfd19d3a9e9314e10039f9fae0747f062")
    expect(tree.serialize()).toEqual(fixture.certificates_serialised)
  })

  test("buildMerkleTreeFromMasterlists should be sort-invariant and deterministic", async () => {
    const a = await buildMerkleTreeFromMasterlists([
      "0x0333333333333333333333333333333333333333333333333333333333333333",
      "0x0111111111111111111111111111111111111111111111111111111111111111",
      "0x0222222222222222222222222222222222222222222222222222222222222222",
    ])
    const b = await buildMerkleTreeFromMasterlists([
      "0x0111111111111111111111111111111111111111111111111111111111111111",
      "0x0222222222222222222222222222222222222222222222222222222222222222",
      "0x0333333333333333333333333333333333333333333333333333333333333333",
    ])
    expect(a.root).toEqual(b.root)
    expect(a.root).toEqual("0x1774e846051ef6eb05fa02a96e571659a3a0fbca6885136d4ee4012276453795")
  })

  test("buildMerkleTreeFromMasterlists should accept a single leaf and produce a well-formed root", async () => {
    const tree = await buildMerkleTreeFromMasterlists([
      "0x0111111111111111111111111111111111111111111111111111111111111111",
    ])
    expect(tree.root).toMatch(/^0x[0-9a-f]{64}$/)
  })

  test("buildMerkleTreeFromRevocations should be deterministic and differ from the empty-tree root", async () => {
    const revocations = [
      {
        fingerprint: "0x0111111111111111111111111111111111111111111111111111111111111111",
        serial: "0x123456789",
      },
      {
        fingerprint: "0x0222222222222222222222222222222222222222222222222222222222222222",
        serial: "0xdeadbeef",
      },
    ]
    const a = await buildMerkleTreeFromRevocations(revocations)
    const b = await buildMerkleTreeFromRevocations(revocations)
    expect(a.root).toEqual(b.root)
    const empty = await buildMerkleTreeFromRevocations([])
    expect(a.root).not.toEqual(empty.root)
    expect(a.root).toMatch(/^0x[0-9a-f]{64}$/)
  })

  test("should produce a valid exclusion proof for a revocation absent from the ordered tree", async () => {
    // CSCA fingerprints lifted from tests/fixtures/root-certs-v1.json
    const cscaA = "0x111a08ff123a169cf2a0830649262c875eaa9544d707a9bd0ba2a92e9dfe1eba"
    const cscaB = "0x2215b0e6cb4d3e69e722c6895caa0ed7285a12a109a055b0c80902200267460b"
    const cscaC = "0x109141f99baa5abcf790ee60daab9a7138e975114fb7676c06897b9185cd2330"

    // A small revocation set that, after Poseidon2 + sort, will leave gaps for an exclusion proof.
    const revocations: IntermediateCertificateRevocation[] = [
      { fingerprint: cscaA, serial: "0x01" },
      { fingerprint: cscaA, serial: "0x02" },
      { fingerprint: cscaB, serial: "0xdeadbeef" },
      { fingerprint: cscaC, serial: "0xc0ffee" },
      { fingerprint: cscaC, serial: "0x123456789" },
    ]

    // The target revocation under cscaA with a made-up serial is NOT in the set above.
    const target: IntermediateCertificateRevocation = {
      fingerprint: cscaA,
      serial: "0x99887766554433221100",
    }
    const targetLeaf = await getRevocationLeafHash(target)

    // Canonical revocation tree (the artefact a verifier would commit to).
    const canonicalTree = await buildMerkleTreeFromRevocations(revocations)

    // Reconstruct the same tree with AsyncIMT so we can produce + verify inclusion proofs.
    // Both trees use Poseidon2, arity 2, and the same height + ordering, so their roots match.
    const sortedLeaves = await getRevocationLeafHashes(revocations)
    // Inline fixture: the canonical sorted Poseidon2 leaf hashes for the revocation set above.
    expect(sortedLeaves).toEqual([
      BigInt("0x053bc9678a8f01ad58f2acc59925c50b2d8a8b9993fab1178fcd43016ab9c170"),
      BigInt("0x0b1fadc15e4accd2b1497f1a24d53cb9ea351b37a0ff7764ff8a549cab6d3d68"),
      BigInt("0x0ea11af40acaaaae4bc5b22cb4c96578b2abb776f814fe2651241e64cd8d7901"),
      BigInt("0x0f25f3969dea458b5a7b1fce2ad3d403841034925d5ca2b01366ad1de089da44"),
      BigInt("0x1aec4655a439d7a81fa0faae6a80c0d5092c3e61bde594738e214e48e0fd742c"),
    ])
    expect(sortedLeaves).not.toContain(targetLeaf)

    const imt = new AsyncIMT(poseidon2, REVOCATION_MERKLE_TREE_HEIGHT, 2)
    await imt.initialize(0n, sortedLeaves)
    expect(`0x${(imt.root as bigint).toString(16).padStart(64, "0")}`).toEqual(canonicalTree.root)

    // Find the bracket [lower, upper] of consecutive sorted leaves such that
    // sortedLeaves[lower] < targetLeaf < sortedLeaves[upper]. In an ordered
    // Merkle tree this bracket constitutes a proof of non-membership: there is
    // no room for the target leaf between two adjacent committed leaves.
    const upperIndex = sortedLeaves.findIndex((leaf) => leaf > targetLeaf)
    expect(upperIndex).toBeGreaterThan(0)
    expect(upperIndex).toBeLessThan(sortedLeaves.length)
    const lowerIndex = upperIndex - 1
    expect(sortedLeaves[lowerIndex] < targetLeaf).toBe(true)
    expect(sortedLeaves[upperIndex] > targetLeaf).toBe(true)

    // Inclusion proofs for the two bracketing leaves.
    const lowerProof = imt.createProof(lowerIndex)
    const upperProof = imt.createProof(upperIndex)

    // Both proofs must verify, share the same root as the canonical tree, and refer
    // to consecutive leaf positions for the bracket to constitute an exclusion proof.
    expect(await AsyncIMT.verifyProof(lowerProof, poseidon2)).toBe(true)
    expect(await AsyncIMT.verifyProof(upperProof, poseidon2)).toBe(true)
    expect(lowerProof.root).toEqual(upperProof.root)
    expect(`0x${(lowerProof.root as bigint).toString(16).padStart(64, "0")}`).toEqual(
      canonicalTree.root,
    )
    expect(upperProof.leafIndex - lowerProof.leafIndex).toEqual(1)
    expect(lowerProof.leaf).toEqual(sortedLeaves[lowerIndex])
    expect(upperProof.leaf).toEqual(sortedLeaves[upperIndex])

    // Sanity: the same procedure must NOT find a bracket for any leaf that IS in the tree
    // (because that leaf is itself a member of `sortedLeaves`, so no strict-greater entry
    // can be paired with a strict-lesser entry around it).
    const memberLeaf = sortedLeaves[2]
    const memberUpperIndex = sortedLeaves.findIndex((leaf) => leaf > memberLeaf)
    expect(sortedLeaves[memberUpperIndex - 1]).not.toBeLessThan(memberLeaf)
  })

  test("should produce a valid exclusion proof for a revocation that would sort before the first leaf", async () => {
    // CSCA fingerprints lifted from tests/fixtures/root-certs-v1.json
    const cscaA = "0x111a08ff123a169cf2a0830649262c875eaa9544d707a9bd0ba2a92e9dfe1eba"
    const cscaB = "0x2215b0e6cb4d3e69e722c6895caa0ed7285a12a109a055b0c80902200267460b"
    const cscaC = "0x109141f99baa5abcf790ee60daab9a7138e975114fb7676c06897b9185cd2330"

    const revocations: IntermediateCertificateRevocation[] = [
      { fingerprint: cscaA, serial: "0x01" },
      { fingerprint: cscaA, serial: "0x02" },
      { fingerprint: cscaB, serial: "0xdeadbeef" },
      { fingerprint: cscaC, serial: "0xc0ffee" },
      { fingerprint: cscaC, serial: "0x123456789" },
    ]
    const sortedLeaves = await getRevocationLeafHashes(revocations)
    // Inline fixture: the canonical sorted Poseidon2 leaf hashes for the revocation set above.
    // Pinning the full array makes the exclusion proof's bounding inequality exact.
    expect(sortedLeaves).toEqual([
      BigInt("0x053bc9678a8f01ad58f2acc59925c50b2d8a8b9993fab1178fcd43016ab9c170"),
      BigInt("0x0b1fadc15e4accd2b1497f1a24d53cb9ea351b37a0ff7764ff8a549cab6d3d68"),
      BigInt("0x0ea11af40acaaaae4bc5b22cb4c96578b2abb776f814fe2651241e64cd8d7901"),
      BigInt("0x0f25f3969dea458b5a7b1fce2ad3d403841034925d5ca2b01366ad1de089da44"),
      BigInt("0x1aec4655a439d7a81fa0faae6a80c0d5092c3e61bde594738e214e48e0fd742c"),
    ])
    const canonicalTree = await buildMerkleTreeFromRevocations(revocations)

    // Hardcoded fixture: serial 0x00000010 under cscaA hashes to a leaf strictly below the
    // smallest committed leaf, so it cannot exist in the ordered tree.
    const target: IntermediateCertificateRevocation = { fingerprint: cscaA, serial: "0x00000010" }
    const targetLeaf = await getRevocationLeafHash(target)
    expect(targetLeaf).toEqual(
      BigInt("0x02801ec5f6a8fa249b152de3bbeff03f579d2788d727ed3ff3a23f8e6ccd0799"),
    )
    expect(sortedLeaves).not.toContain(targetLeaf)
    expect(targetLeaf < sortedLeaves[0]).toBe(true)

    const imt = new AsyncIMT(poseidon2, REVOCATION_MERKLE_TREE_HEIGHT, 2)
    await imt.initialize(0n, sortedLeaves)
    expect(`0x${(imt.root as bigint).toString(16).padStart(64, "0")}`).toEqual(canonicalTree.root)

    // Boundary exclusion proof for the start: an inclusion proof for the smallest
    // committed leaf at index 0, paired with the strict inequality target < leaves[0].
    // Since the tree is ordered ascending, no leaf smaller than leaves[0] can be present.
    const firstProof = imt.createProof(0)
    expect(await AsyncIMT.verifyProof(firstProof, poseidon2)).toBe(true)
    expect(`0x${(firstProof.root as bigint).toString(16).padStart(64, "0")}`).toEqual(
      canonicalTree.root,
    )
    expect(firstProof.leafIndex).toEqual(0)
    expect(firstProof.leaf).toEqual(sortedLeaves[0])
    expect(targetLeaf < (firstProof.leaf as bigint)).toBe(true)
  })

  test("should produce a valid exclusion proof for a revocation that would sort after the last leaf", async () => {
    const cscaA = "0x111a08ff123a169cf2a0830649262c875eaa9544d707a9bd0ba2a92e9dfe1eba"
    const cscaB = "0x2215b0e6cb4d3e69e722c6895caa0ed7285a12a109a055b0c80902200267460b"
    const cscaC = "0x109141f99baa5abcf790ee60daab9a7138e975114fb7676c06897b9185cd2330"

    const revocations: IntermediateCertificateRevocation[] = [
      { fingerprint: cscaA, serial: "0x01" },
      { fingerprint: cscaA, serial: "0x02" },
      { fingerprint: cscaB, serial: "0xdeadbeef" },
      { fingerprint: cscaC, serial: "0xc0ffee" },
      { fingerprint: cscaC, serial: "0x123456789" },
    ]
    const sortedLeaves = await getRevocationLeafHashes(revocations)
    // Inline fixture: the canonical sorted Poseidon2 leaf hashes for the revocation set above.
    // Pinning the full array makes the exclusion proof's bounding inequality exact.
    expect(sortedLeaves).toEqual([
      BigInt("0x053bc9678a8f01ad58f2acc59925c50b2d8a8b9993fab1178fcd43016ab9c170"),
      BigInt("0x0b1fadc15e4accd2b1497f1a24d53cb9ea351b37a0ff7764ff8a549cab6d3d68"),
      BigInt("0x0ea11af40acaaaae4bc5b22cb4c96578b2abb776f814fe2651241e64cd8d7901"),
      BigInt("0x0f25f3969dea458b5a7b1fce2ad3d403841034925d5ca2b01366ad1de089da44"),
      BigInt("0x1aec4655a439d7a81fa0faae6a80c0d5092c3e61bde594738e214e48e0fd742c"),
    ])
    const canonicalTree = await buildMerkleTreeFromRevocations(revocations)
    const lastIndex = sortedLeaves.length - 1

    // Hardcoded fixture: serial 0x00000004 under cscaA hashes to a leaf strictly above the
    // largest committed leaf, so it cannot exist in the ordered tree.
    const target: IntermediateCertificateRevocation = { fingerprint: cscaA, serial: "0x00000004" }
    const targetLeaf = await getRevocationLeafHash(target)
    expect(targetLeaf).toEqual(
      BigInt("0x2213b4afd8dd24eed1374554561d9d70be229127b978eba6e480872b6193296b"),
    )
    expect(sortedLeaves).not.toContain(targetLeaf)
    expect(targetLeaf > sortedLeaves[lastIndex]).toBe(true)

    const imt = new AsyncIMT(poseidon2, REVOCATION_MERKLE_TREE_HEIGHT, 2)
    await imt.initialize(0n, sortedLeaves)
    expect(`0x${(imt.root as bigint).toString(16).padStart(64, "0")}`).toEqual(canonicalTree.root)

    // Boundary exclusion proof for the end: an inclusion proof for the largest committed
    // leaf at index N-1, paired with the strict inequality leaves[N-1] < target. Since the
    // tree is ordered ascending and the next slot (index N) is the canonical zero leaf in
    // the padded ordered tree, no leaf greater than leaves[N-1] can be present.
    const lastProof = imt.createProof(lastIndex)
    expect(await AsyncIMT.verifyProof(lastProof, poseidon2)).toBe(true)
    expect(`0x${(lastProof.root as bigint).toString(16).padStart(64, "0")}`).toEqual(
      canonicalTree.root,
    )
    expect(lastProof.leafIndex).toEqual(lastIndex)
    expect(lastProof.leaf).toEqual(sortedLeaves[lastIndex])
    expect((lastProof.leaf as bigint) < targetLeaf).toBe(true)
  })

  test("should correctly convert timestamp to 4 byte array and back again", () => {
    const timestamp = 1768823285
    const expiry = new Uint8Array(4)
    expiry[0] = (timestamp >> 24) & 0xff
    expiry[1] = (timestamp >> 16) & 0xff
    expiry[2] = (timestamp >> 8) & 0xff
    expiry[3] = timestamp & 0xff
    expect(expiry).toEqual(new Uint8Array([105, 110, 25, 245]))
    expect(BigInt(`0x${Buffer.from(expiry).toString("hex")}`)).toEqual(BigInt(timestamp))
  })
})
