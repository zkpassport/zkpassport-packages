import { describe, expect, test } from "bun:test"
import { p256, p521 } from "@noble/curves/nist.js"
import { sha256 } from "@noble/hashes/sha2.js"
import { SignedData } from "@peculiar/asn1-cms"
import { AsnConvert, AsnSerializer } from "@peculiar/asn1-schema"
import { SubjectPublicKeyInfo } from "@peculiar/asn1-x509"
import { Binary } from "../binary"
import { id_sha256, LDSSecurityObject } from "../cms/asn"
import { getRSAPSSParams } from "../cms/utils"
import { SOD } from "../passport/sod"
import {
  generateSigningCertificates,
  generateSod,
  getRsaPssSignatureAlgorithm,
  type KeyPair,
  signSod,
  wrapSodInContentInfo,
} from "."

const dg1 = Binary.from(new Uint8Array(93).fill(0x3c))

describe("generateSod", () => {
  test("builds an unsigned SOD whose security object holds the DG1 hash", () => {
    const { contentInfo } = generateSod(dg1)
    const sod = AsnConvert.parse(contentInfo.content, SignedData)
    const securityObject = AsnConvert.parse(
      sod.encapContentInfo.eContent!.single!,
      LDSSecurityObject,
    )

    expect(securityObject.hashAlgorithm.algorithm).toBe(id_sha256)
    expect(securityObject.dataGroups.map((group) => group.number)).toEqual([1, 2])
    expect(new Uint8Array(securityObject.dataGroups[0].hash)).toEqual(sha256(dg1.toUInt8Array()))
    expect(sod.signerInfos[0].signedAttrs).toHaveLength(3)
    expect(sod.certificates).toHaveLength(0)
  })
})

describe("signSod", () => {
  test.each([
    ["ECDSA P-521 CSCA and P-256 DSC", {}],
    [
      "RSA CSCA and DSC",
      { cscKeyType: "RSA", dscKeyType: "RSA", cscKeySize: 2048, dscKeySize: 2048 } as const,
    ],
  ])("signs a SOD that verifies up to the CSCA, with an %s", async (_, keyOptions) => {
    const { cscKeys, dsc, dscKeys } = await generateSigningCertificates(keyOptions)
    const { sod: unsignedSod } = generateSod(dg1, [dsc])
    const { sod: signedSod } = await signSod(unsignedSod, dscKeys, "SHA-256")

    const sod = SOD.fromDER(Binary.from(AsnSerializer.serialize(wrapSodInContentInfo(signedSod))))

    expect(
      await verifySignature(
        cscKeys,
        sod.certificate.tbs.bytes.toUInt8Array(),
        sod.certificate.signature.toUInt8Array(),
        "der",
      ),
    ).toBe(true)
    expect(
      await verifySignature(
        dscKeys,
        sod.signerInfo.signedAttrs.bytes.toUInt8Array(),
        sod.signerInfo.signature.toUInt8Array(),
        "compact",
      ),
    ).toBe(true)
  })

  test("signs with RSA-PSS when the SOD's signature algorithm is RSASSA-PSS", async () => {
    const { dsc, dscKeys } = await generateSigningCertificates({
      cscKeyType: "RSA",
      dscKeyType: "RSA",
      cscKeySize: 2048,
      dscKeySize: 2048,
    })
    const signatureAlgorithm = getRsaPssSignatureAlgorithm("SHA-384")
    const { sod: unsignedSod } = generateSod(dg1, [dsc], "SHA-384", signatureAlgorithm)
    const { sod: signedSod } = await signSod(unsignedSod, dscKeys, "SHA-384")

    const sod = SOD.fromDER(Binary.from(AsnSerializer.serialize(wrapSodInContentInfo(signedSod))))
    const pssParams = getRSAPSSParams(
      new Uint8Array(sod.signerInfo.signatureAlgorithm.parameters!.toUInt8Array()),
    )
    const publicKey = await crypto.subtle.importKey(
      "spki",
      new Uint8Array(dscKeys.publicKey),
      { name: "RSA-PSS", hash: "SHA-384" },
      false,
      ["verify"],
    )

    expect(sod.signerInfo.signatureAlgorithm.name.toLowerCase()).toContain("pss")
    expect(pssParams).toMatchObject({ hashAlgorithm: "SHA384", saltLength: 48 })
    expect(
      await crypto.subtle.verify(
        { name: "RSA-PSS", saltLength: 48 },
        publicKey,
        new Uint8Array(sod.signerInfo.signature.toUInt8Array()),
        new Uint8Array(sod.signerInfo.signedAttrs.bytes.toUInt8Array()),
      ),
    ).toBe(true)
  })
})

/** Verify a SHA-256 signature, in DER or r ‖ s form for ECDSA */
async function verifySignature(
  keyPair: KeyPair,
  message: Uint8Array,
  signature: Uint8Array,
  ecdsaFormat: "der" | "compact",
) {
  if (keyPair.type === "RSA") {
    return crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      keyPair.cryptoKey.publicKey,
      new Uint8Array(signature),
      new Uint8Array(message),
    )
  }

  const curves = { "P-256": p256, "P-521": p521 } as const
  const curve = curves[keyPair.curve as keyof typeof curves]
  const { subjectPublicKey } = AsnConvert.parse(keyPair.publicKey, SubjectPublicKeyInfo)
  return curve.verify(signature, sha256(message), new Uint8Array(subjectPublicKey), {
    prehash: false,
    lowS: false,
    format: ecdsaFormat,
  })
}
