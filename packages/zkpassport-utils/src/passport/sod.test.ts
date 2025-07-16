import { Binary } from "../binary"
import { SOD } from "./sod"

const FIXTURE_EF_SOD =
  "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"

describe("SOD", () => {
  let sodBytes: Binary
  let sod: SOD

  beforeAll(async () => {
    sodBytes = Binary.fromBase64(FIXTURE_EF_SOD)
    sod = SOD.fromDER(sodBytes)
  })

  it("should parse basic SOD properties", () => {
    expect(sod.version).toBe(3)
    expect(sod.digestAlgorithms).toEqual(["SHA256"])
  })

  it("should parse eContent data correctly", () => {
    const eContent = sod.encapContentInfo.eContent
    expect(eContent.version).toBe(0)
    expect(eContent.hashAlgorithm).toBe("SHA256")

    // Verify data group hash values
    const dgHashes = eContent.dataGroupHashValues.values
    expect(Object.keys(dgHashes).length).toBe(5)
    expect(dgHashes[1].toHex()).toBe(
      "0x4170ca879fce6a22ffef1567ff88079f415c66ead250ab5f23781ac2cdbf42b6",
    )
    expect(dgHashes[2].toHex()).toBe(
      "0xa9a1b09dfd598087ab3fce4ae2ec65b1a1525bd258bfc27df4419f8a65e54745",
    )
  })

  it("should parse signer info correctly", () => {
    const signerInfo = sod.signerInfo
    expect(signerInfo.version).toBe(1)
    expect(signerInfo.digestAlgorithm).toBe("SHA256")
    // TODO: Consider adding rsaPSS to signatureAlgorithm types
    expect(signerInfo.signatureAlgorithm.name as string).toBe("rsaPSS")

    // Verify signed attributes
    expect(signerInfo.signedAttrs.contentType).toBe("mRTDSignatureData")
    expect(signerInfo.signedAttrs.messageDigest.toHex()).toBe(
      "0x0420b46a0d05e280f398efeeebff67e78c736add15e75670b1ad4c6c534e8187b9d6",
    )
  })

  it("should parse certificate information correctly", () => {
    const cert = sod.certificate
    const tbs = cert.tbs

    // Check certificate validity dates
    expect(tbs.validity.notBefore).toEqual(new Date("2013-12-16T21:43:18.000Z"))
    expect(tbs.validity.notAfter).toEqual(new Date("2014-12-11T21:43:18.000Z"))

    // Verify issuer and subject
    expect(tbs.issuer).toBe(
      "countryName=DE, organizationName=HJP Consulting, organizationalUnitName=Country Signer, commonName=HJP PB CS",
    )
    expect(tbs.subject).toBe(
      "countryName=DE, organizationName=HJP Consulting, organizationalUnitName=Document Signer, commonName=HJP PB DS",
    )

    // Check certificate extensions
    expect(tbs.extensions.has("keyUsage")).toBe(true)
    expect(tbs.extensions.has("authorityKeyIdentifier")).toBe(true)
    expect(tbs.extensions.has("subjectKeyIdentifier")).toBe(true)
    expect(tbs.extensions.get("keyUsage")?.critical).toBe(true)
  })

  it("should parse signature algorithms correctly", () => {
    const cert = sod.certificate

    // Check signature algorithms
    // TODO: Consider adding rsaPSS to signatureAlgorithm types
    expect(cert.signatureAlgorithm.name as string).toBe("rsaPSS")
    expect(cert.tbs.subjectPublicKeyInfo.signatureAlgorithm.name).toBe("rsaEncryption")

    // Verify signature exists
    expect(cert.signature).toBeTruthy()
    expect(sod.signerInfo.signature).toBeTruthy()
  })

  it("should get the exportable SOD", () => {
    const exportableSOD = sod.getExportableSOD()
    expect(exportableSOD.bytes).toBe(sod.bytes.length)
    expect(exportableSOD.encapContentInfo.eContent.bytes).toBe(
      sod.encapContentInfo.eContent.bytes.length,
    )
    expect(exportableSOD.encapContentInfo.eContent.dataGroupHashValues).toEqual({
      1: 32,
      2: 32,
      3: 32,
      4: 32,
      14: 32,
    })
    expect(exportableSOD.signerInfo.signedAttrs.bytes).toBe(sod.signerInfo.signedAttrs.bytes.length)
    expect(exportableSOD.signerInfo.signature).toBe(sod.signerInfo.signature.length)
    expect(exportableSOD.signerInfo.sid.issuerAndSerialNumber?.serialNumber).toBe(
      sod.signerInfo.sid.issuerAndSerialNumber?.serialNumber.length,
    )
    expect(exportableSOD.certificate.signature).toBe(sod.certificate.signature)
    expect(exportableSOD.certificate.tbs.extensions.get("keyUsage")?.critical).toBe(true)
    expect(exportableSOD.certificate.tbs.extensions.has("authorityKeyIdentifier")).toBe(true)
    expect(exportableSOD.certificate.tbs.extensions.has("subjectKeyIdentifier")).toBe(true)
  })

  it("should redact all sensitive data (hashes, signature, message digest) with zeros", () => {
    const redactedSOD = sod.getRedactedSOD()

    // The redacted SOD should have the same length as the original
    expect(redactedSOD.length).toBe(sod.bytes.length)

    // But should not contain the original data group hash values
    const dgHashes = sod.encapContentInfo.eContent.dataGroupHashValues.values
    const redactedHex = redactedSOD.toHex()

    // Verify that none of the original hash values are present in the redacted SOD
    Object.values(dgHashes).forEach((hashValue) => {
      const hashHex = hashValue.toHex().slice(2) // Remove 0x prefix
      expect(redactedHex).not.toContain(hashHex)
    })

    // Verify that the signature is also redacted (not present in redacted SOD)
    const signatureHex = sod.signerInfo.signature.toHex().slice(2)
    expect(redactedHex).not.toContain(signatureHex)

    // Verify that the message digest is also redacted (not present in redacted SOD)
    const messageDigestHex = sod.signerInfo.signedAttrs.messageDigest.toHex().slice(2)
    expect(redactedHex).not.toContain(messageDigestHex)

    // The redacted SOD should be different from the original
    expect(redactedSOD.equals(sod.bytes)).toBe(false)

    // But still be a valid binary of the same size
    expect(redactedSOD).toBeInstanceOf(Binary)
  })

  it("compares the redacted SOD with the original SOD", () => {
    const redactedSOD = sod.getRedactedSOD()

    // Parse the redacted SOD back to verify its structure
    const redactedSODParsed = SOD.fromDER(redactedSOD)

    // The structure should be identical to the original
    expect(redactedSODParsed.version).toBe(sod.version)
    expect(redactedSODParsed.digestAlgorithms).toEqual(sod.digestAlgorithms)
    expect(redactedSODParsed.encapContentInfo.eContentType).toBe(sod.encapContentInfo.eContentType)
    expect(redactedSODParsed.encapContentInfo.eContent.version).toBe(
      sod.encapContentInfo.eContent.version,
    )
    expect(redactedSODParsed.encapContentInfo.eContent.hashAlgorithm).toBe(
      sod.encapContentInfo.eContent.hashAlgorithm,
    )

    // The data group hash values should all be zeros
    const redactedDGHashes = redactedSODParsed.encapContentInfo.eContent.dataGroupHashValues.values
    const originalDGHashes = sod.encapContentInfo.eContent.dataGroupHashValues.values
    const redactedSignature = redactedSODParsed.signerInfo.signature.toHex().slice(2)
    const redactedMessageDigest = redactedSODParsed.signerInfo.signedAttrs.messageDigest
      .toHex()
      .slice(2)
    const originalSignature = sod.signerInfo.signature.toHex().slice(2)
    const originalMessageDigest = sod.signerInfo.signedAttrs.messageDigest.toHex().slice(2)

    // Should have the same data group numbers
    expect(Object.keys(redactedDGHashes)).toEqual(Object.keys(originalDGHashes))
    expect(redactedSignature).not.toBe(originalSignature)
    expect(redactedMessageDigest).not.toBe(originalMessageDigest)

    // But all hash values should be zeros (while maintaining original lengths)
    Object.entries(redactedDGHashes).forEach(([dgNumber, hashValue]) => {
      const originalLength = originalDGHashes[Number(dgNumber)].length
      expect(hashValue.length).toBe(originalLength) // Same length as original
      expect(hashValue.toNumberArray().every((byte) => byte === 0)).toBe(true) // All bytes are zeros
    })

    // Verify that the signature is redacted (replaced with zeros)
    const redactedHex = redactedSOD.toHex()
    const originalSignatureHex = sod.signerInfo.signature.toHex().slice(2)
    const zeroSignature = "0".repeat(originalSignatureHex.length)

    // Original signature should not be present
    expect(redactedHex).not.toContain(originalSignatureHex)

    // Zero signature should be present instead
    expect(redactedHex).toContain(zeroSignature)

    //same for the message digest
    const originalMessageDigestHex = sod.signerInfo.signedAttrs.messageDigest.toHex().slice(2)
    const zeroMessageDigest = "0".repeat(originalMessageDigestHex.length)
    expect(redactedHex).not.toContain(originalMessageDigestHex)
    expect(redactedHex).toContain(zeroMessageDigest)

    // Non-sensitive data should be identical to the original, except signature and message digest
    expect(redactedSODParsed.signerInfo.version).toBe(sod.signerInfo.version)
    expect(redactedSODParsed.signerInfo.digestAlgorithm).toBe(sod.signerInfo.digestAlgorithm)
    expect(redactedSODParsed.signerInfo.signatureAlgorithm.name).toBe(
      sod.signerInfo.signatureAlgorithm.name,
    )
  })

  it("should produce identical results when redacting twice (idempotency)", () => {
    const redactedOnce = sod.getRedactedSOD()
    const redactedTwice = SOD.fromDER(redactedOnce).getRedactedSOD()

    expect(redactedOnce.equals(redactedTwice)).toBe(true)
  })

  it("should maintain exact byte lengths for all redacted values", () => {
    const redactedSOD = sod.getRedactedSOD()
    const redactedParsed = SOD.fromDER(redactedSOD)

    // Verify data group hash lengths are preserved
    Object.entries(sod.encapContentInfo.eContent.dataGroupHashValues.values).forEach(
      ([dgNum, originalHash]) => {
        const redactedHash =
          redactedParsed.encapContentInfo.eContent.dataGroupHashValues.values[Number(dgNum)]
        expect(redactedHash.length).toBe(originalHash.length)
      },
    )

    // Verify signature length is preserved
    expect(redactedParsed.signerInfo.signature.length).toBe(sod.signerInfo.signature.length)

    // Verify message digest length is preserved
    expect(redactedParsed.signerInfo.signedAttrs.messageDigest.length).toBe(
      sod.signerInfo.signedAttrs.messageDigest.length,
    )
  })

  it("should ensure no sensitive data remains anywhere in the SOD", () => {
    const redactedSOD = sod.getRedactedSOD()
    const redactedHex = redactedSOD.toHex()

    // Check that NO occurrence of sensitive data exists (not just first occurrence)
    const sensitiveValues = [
      ...Object.values(sod.encapContentInfo.eContent.dataGroupHashValues.values),
      sod.signerInfo.signature,
      sod.signerInfo.signedAttrs.messageDigest,
    ]

    sensitiveValues.forEach((sensitiveValue) => {
      const hexValue = sensitiveValue.toHex().slice(2)
      // Should not appear anywhere in the redacted SOD
      expect(redactedHex.split(hexValue).length).toBe(1) // If found, split would create >1 parts
    })
  })

  it("should replace sensitive data with proper zero patterns", () => {
    const redactedSOD = sod.getRedactedSOD()
    const redactedParsed = SOD.fromDER(redactedSOD)

    // Verify all data group hashes are exactly zero-filled
    Object.values(redactedParsed.encapContentInfo.eContent.dataGroupHashValues.values).forEach(
      (hashValue) => {
        expect(hashValue.toNumberArray().every((byte) => byte === 0)).toBe(true)
      },
    )

    // Verify signature is exactly zero-filled
    expect(redactedParsed.signerInfo.signature.toNumberArray().every((byte) => byte === 0)).toBe(
      true,
    )

    // Verify message digest has preserved ASN.1 structure but zeroed content
    const messageDigest = redactedParsed.signerInfo.signedAttrs.messageDigest.toNumberArray()
    // Verify the actual digest content (after tag and length) is zero-filled
    expect(messageDigest.slice(2).every((byte) => byte === 0)).toBe(true)
  })

  it("should handle edge cases and maintain SOD integrity", () => {
    const redactedSOD = sod.getRedactedSOD()

    // SOD should still be valid ASN.1 structure
    expect(() => SOD.fromDER(redactedSOD)).not.toThrow()

    // Should maintain same structure fields
    const redactedParsed = SOD.fromDER(redactedSOD)
    expect(redactedParsed.version).toBe(sod.version)
    expect(redactedParsed.digestAlgorithms).toEqual(sod.digestAlgorithms)
    expect(redactedParsed.encapContentInfo.eContentType).toBe(sod.encapContentInfo.eContentType)

    // Certificate should be unchanged
    expect(redactedParsed.certificate.tbs.subject).toBe(sod.certificate.tbs.subject)
    expect(redactedParsed.certificate.tbs.issuer).toBe(sod.certificate.tbs.issuer)
  })
})
