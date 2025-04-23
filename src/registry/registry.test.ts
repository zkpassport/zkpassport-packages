import { PackagedCertificate } from "../types"
import { getCertificateLeafHash } from "."
import { CERT_TYPE_DSC } from "../constants"

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
    subject_key_identifier: "0x1111",
    authority_key_identifier: "0x2222",
    private_key_usage_period: {
      not_before: 1000000000,
      not_after: 2000000000,
    },
    tags: ["ICAO", "DE"],
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
    subject_key_identifier: "0x1111",
    authority_key_identifier: "0x2222",
    private_key_usage_period: {
      not_before: 1000000000,
      not_after: 2000000000,
    },
    tags: ["ICAO", "DE"],
  }

  test("should generate correct canonical leaf for RSA cert", async () => {
    const leaf = await getCertificateLeafHash(rsaCert)
    expect(leaf).toEqual("0x28eefd19090dd88b450bbf65da4124357975da9937a159c3379dc6bbf2539f77")
  })

  test("should generate correct canonical leaf for ECDSA cert", async () => {
    const leaf = await getCertificateLeafHash(ecdsaCert)
    expect(leaf).toEqual("0x2e006f1f71102863da262f1637ec4a9e2eb81e710c92992774fb9b00720aee13")
  })

  test("should generate correct canonical leaf for different publisher and type", async () => {
    const leaf = await getCertificateLeafHash(rsaCert, {
      tags: ["ICAO"],
      type: CERT_TYPE_DSC,
    })
    expect(leaf).toEqual("0x12505ce2da43cd1465dd8c7d911dbcfa499b2fd7c427c411ccd8b5dc15075f26")
  })
})
