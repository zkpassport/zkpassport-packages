import {
  calculateCertificateRoot,
  calculateCircuitRoot,
  CERT_TYPE_DSC,
  getCertificateLeafHash,
  tagsArrayToBitsFlag,
  bitsFlagToTagsArray,
} from "../src/registry"
import { PackagedCertificate } from "../src/types"
import rootCerts from "./fixtures/root-certs.json"
import rootCertsV1 from "./fixtures/root-certs-v1.json"
import circuitManifest from "./fixtures/manifest.json"

describe("Registry", () => {
  const rsaCert: PackagedCertificate = {
    country: "XYZ",
    signature_algorithm: "RSA",
    hash_algorithm: "SHA-256",
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
    hash_algorithm: "SHA-256",
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
    const root = await calculateCertificateRoot(rootCerts.certificates as PackagedCertificate[])
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
    const root = await calculateCertificateRoot(
      rootCertsV1.certificates as PackagedCertificate[],
      1,
    )
    expect(root).toEqual("0x2b49d7ddaec2fa540efec3311af6223cfd19d3a9e9314e10039f9fae0747f062")
  })

  test("should generate correct canonical circuit root", async () => {
    const hashes = Object.values(circuitManifest.circuits).map((circuit) => circuit.hash)
    const root = await calculateCircuitRoot({ hashes })
    expect(root).toEqual(circuitManifest.root)
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
