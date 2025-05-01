import { p256 } from "@noble/curves/p256"
import { p384 } from "@noble/curves/p384"
import { p521 } from "@noble/curves/p521"
import { ECParameters } from "@peculiar/asn1-ecc"
import { RSAPublicKey, RsaSaPssParams } from "@peculiar/asn1-rsa"
import { AsnParser } from "@peculiar/asn1-schema"
import {
  AlgorithmIdentifier,
  AuthorityKeyIdentifier,
  ParametersType,
  PrivateKeyUsagePeriod,
  SubjectKeyIdentifier,
  SubjectPublicKeyInfo,
  Certificate as X509Certificate,
} from "@peculiar/asn1-x509"
import {
  BRAINPOOL_CURVES,
  BRAINPOOL_CURVES_ABBR,
  CURVE_OIDS,
  HASH_OIDS,
  id_authorityKeyIdentifier,
  id_privateKeyUsagePeriod,
  id_subjectKeyIdentifier,
  OIDS_TO_PUBKEY_TYPE,
  OIDS_TO_SIG_ALGORITHM,
  RSA_OIDS,
  SIG_ALGORITHM_TO_HASH,
} from "./constants"
import type { DigestAlgorithm } from "./types"
import {
  CurveName,
  BrainpoolCurveName,
  PackagedCertificate,
  SignatureAlgorithmType,
  ECPublicKey,
  HashAlgorithm,
} from "../types"
import { countryCodeAlpha2ToAlpha3 } from "../country/country"

export function getAbbreviatedCurveName(ecParams: ECParameters): string {
  const curveName = getCurveName(ecParams)
  return BRAINPOOL_CURVES_ABBR[curveName as keyof typeof BRAINPOOL_CURVES_ABBR] || curveName
}

export function getCurveName(ecParams: ECParameters): CurveName {
  if (ecParams.namedCurve) {
    if (!(ecParams.namedCurve in CURVE_OIDS)) {
      throw new Error(`Unknown curve OID: ${ecParams.namedCurve}`)
    }
    return CURVE_OIDS[ecParams.namedCurve as keyof typeof CURVE_OIDS] as CurveName
  }
  if (!ecParams.specifiedCurve) {
    throw new Error("No named or specified curve found in ECParameters")
  }
  // Map the specified curve to a known Brainpool curve name
  const a = BigInt(`0x${Buffer.from(ecParams.specifiedCurve.curve.a).toString("hex")}`)
  const b = BigInt(`0x${Buffer.from(ecParams.specifiedCurve.curve.b).toString("hex")}`)
  const n = BigInt(`0x${Buffer.from(ecParams.specifiedCurve.order).toString("hex")}`)
  const p = BigInt(
    `0x${Buffer.from(ecParams.specifiedCurve.fieldID.parameters.slice(2)).toString("hex")}`,
  )
  if (a == p256.CURVE.a && b == p256.CURVE.b && n == p256.CURVE.n && p == p256.CURVE.Fp.ORDER) {
    return "P-256"
  } else if (
    a == p384.CURVE.a &&
    b == p384.CURVE.b &&
    n == p384.CURVE.n &&
    p == p384.CURVE.Fp.ORDER
  ) {
    return "P-384"
  } else if (
    a == p521.CURVE.a &&
    b == p521.CURVE.b &&
    n == p521.CURVE.n &&
    p == p521.CURVE.Fp.ORDER
  ) {
    return "P-521"
  }
  for (const key in BRAINPOOL_CURVES) {
    if (
      a == BRAINPOOL_CURVES[key as keyof typeof BRAINPOOL_CURVES].a &&
      b == BRAINPOOL_CURVES[key as keyof typeof BRAINPOOL_CURVES].b &&
      n == BRAINPOOL_CURVES[key as keyof typeof BRAINPOOL_CURVES].n &&
      p == BRAINPOOL_CURVES[key as keyof typeof BRAINPOOL_CURVES].p
    ) {
      return key as BrainpoolCurveName
    }
  }
  throw new Error(`Unknown curve: ${a}, ${b}, ${n}, ${p}`)
}

export function getAuthorityKeyId(cert: X509Certificate): string | undefined {
  const authKeyExt = cert.tbsCertificate.extensions?.find(
    (ext) => ext.extnID === id_authorityKeyIdentifier,
  )
  if (authKeyExt?.extnValue) {
    try {
      const authKeyId = AsnParser.parse(authKeyExt.extnValue, AuthorityKeyIdentifier)
      const keyId = authKeyId?.keyIdentifier?.buffer
      if (!keyId) return
      return `0x${Buffer.from(keyId).toString("hex")}`
    } catch (error) {
      return
    }
  }
  return
}

export function getSubjectKeyId(cert: X509Certificate): string | undefined {
  const subjKeyExt = cert.tbsCertificate.extensions?.find(
    (ext) => ext.extnID === id_subjectKeyIdentifier,
  )
  if (subjKeyExt?.extnValue) {
    try {
      const subjKeyId = AsnParser.parse(subjKeyExt.extnValue, SubjectKeyIdentifier)
      const keyId = subjKeyId?.buffer
      if (!keyId) return
      return `0x${Buffer.from(keyId).toString("hex")}`
    } catch (error) {
      return
    }
  }
  return
}

export function getPrivateKeyUsagePeriod(
  cert: X509Certificate,
): { not_before?: number; not_after?: number } | undefined {
  const pkupExt = cert.tbsCertificate.extensions?.find(
    (ext) => ext.extnID === id_privateKeyUsagePeriod,
  )
  if (pkupExt?.extnValue) {
    const pkup = AsnParser.parse(pkupExt.extnValue, PrivateKeyUsagePeriod)
    return {
      not_before: pkup.notBefore ? Math.floor(pkup.notBefore.getTime() / 1000) : undefined,
      not_after: pkup.notAfter ? Math.floor(pkup.notAfter.getTime() / 1000) : undefined,
    }
  }
  return
}

function fromBytesToBigInt(bytes: number[]): bigint {
  return BigInt("0x" + Buffer.from(bytes).toString("hex"))
}

function fromArrayBufferToBigInt(buffer: ArrayBuffer): bigint {
  return BigInt("0x" + Buffer.from(buffer).toString("hex"))
}

export function getECDSAInfo(subjectPublicKeyInfo: SubjectPublicKeyInfo): {
  curve: CurveName
  publicKey: Uint8Array
  keySize: number
} {
  const parsedParams = AsnParser.parse(subjectPublicKeyInfo.algorithm.parameters!, ECParameters)
  const curve = getCurveName(parsedParams)
  return {
    curve,
    publicKey: new Uint8Array(subjectPublicKeyInfo.subjectPublicKey),
    keySize: getKeySizeFromCurve(curve),
  }
}

export function getRSAPSSParams(parameters: ParametersType): {
  hashAlgorithm: DigestAlgorithm
  saltLength: number
  maskGenAlgorithm: string
} {
  const parsedKey = AsnParser.parse(parameters!, RsaSaPssParams)
  const hashAlgorithm = HASH_OIDS[parsedKey.hashAlgorithm.algorithm as keyof typeof HASH_OIDS] ?? ""
  const maskGenAlgorithm =
    HASH_OIDS[parsedKey.maskGenAlgorithm.algorithm as keyof typeof HASH_OIDS] ?? ""
  return {
    hashAlgorithm: hashAlgorithm.replace("SHA-", "SHA") as DigestAlgorithm,
    saltLength: parsedKey.saltLength,
    maskGenAlgorithm,
  }
}

export function getRSAInfo(subjectPublicKeyInfo: SubjectPublicKeyInfo): {
  modulus: bigint
  exponent: bigint
  type: "pkcs" | "pss"
} {
  const parsedKey = AsnParser.parse(subjectPublicKeyInfo.subjectPublicKey!, RSAPublicKey)
  const type = RSA_OIDS[subjectPublicKeyInfo.algorithm.algorithm as keyof typeof RSA_OIDS] ?? ""
  return {
    modulus: fromArrayBufferToBigInt(parsedKey.modulus),
    exponent: fromArrayBufferToBigInt(parsedKey.publicExponent),
    type: type.includes("pss") ? "pss" : "pkcs",
  }
}

export function getSigningKeyType(cert: X509Certificate): string {
  const spki = cert.tbsCertificate.subjectPublicKeyInfo
  const publicKeyAlgOID = spki.algorithm.algorithm
  const publicKeyType = OIDS_TO_PUBKEY_TYPE[publicKeyAlgOID] || publicKeyAlgOID
  const sigAlgOID = cert.tbsCertificate.signature.algorithm
  const sigAlg = OIDS_TO_SIG_ALGORITHM[sigAlgOID as keyof typeof OIDS_TO_SIG_ALGORITHM] ?? sigAlgOID
  if (publicKeyType === "rsaEncryption") {
    const rsaInfo = getRSAInfo(spki)
    const keySize = rsaInfo.modulus.toString(2).length.toString()
    if (sigAlg === "rsassa-pss") {
      return `RSAPSS-${keySize}`
    } else {
      return `RSA-${keySize}`
    }
  } else if (publicKeyType === "ecPublicKey") {
    const curve = getAbbreviatedCurveName(AsnParser.parse(spki.algorithm.parameters!, ECParameters))
    const pubkey = new Uint8Array(spki.subjectPublicKey)
    // Ensure the key size is within the curve
    // The first byte is 0x04, which is the prefix for uncompressed public keys so we get rid of it
    const pubkeyX = BigInt(
      "0x" + Buffer.from(pubkey.slice(1, pubkey.length / 2 + 1)).toString("hex"),
    )
    const pubkeyY = BigInt("0x" + Buffer.from(pubkey.slice(pubkey.length / 2 + 1)).toString("hex"))
    const pubkeySizeX = pubkeyX.toString(2).length
    const pubkeySizeY = pubkeyY.toString(2).length
    const expectedKeySize = parseInt(curve.split("-")[1])
    if (pubkeySizeX > expectedKeySize || pubkeySizeY > expectedKeySize) {
      throw new Error(`Key size exceeds size of curve ${curve}`)
    }
    return curve
  }
  return ""
}

/**
 * Get the signature algorithm type from an x509 certificate
 * @param x509 Certificate
 * @returns Signature algorithm type (RSA, RSA-PSS, or ECDSA)
 */
export function getSignatureAlgorithmType(x509: X509Certificate): SignatureAlgorithmType {
  const algorithmOID = x509.tbsCertificate.signature.algorithm
  const signatureAlgo =
    OIDS_TO_SIG_ALGORITHM[algorithmOID as keyof typeof OIDS_TO_SIG_ALGORITHM] ?? algorithmOID
  if (signatureAlgo === "rsassa-pss") {
    return "RSA-PSS"
  } else if (signatureAlgo.toLowerCase().includes("rsa")) {
    return "RSA"
  } else if (signatureAlgo.toLowerCase().includes("ecdsa")) {
    return "ECDSA"
  } else {
    throw new Error(`Unsupported signature algorithm: ${signatureAlgo}`)
  }
}

export function getBitSizeFromCurve(curve: string): number {
  const curveName = curve
    .replace("brainpoolP", "")
    .replace("nist", "")
    .replace("-", "")
    .replace("r1", "")
    .replace("t1", "")
    .toLowerCase()
  return Number(curveName.replace("p", ""))
}

export function getCertificateIssuer(cert: X509Certificate): string | undefined {
  return formatAbbreviatedDN(cert.tbsCertificate.issuer)
}

export function getCertificateSubject(cert: X509Certificate): string | undefined {
  return formatAbbreviatedDN(cert.tbsCertificate.subject)
}

export function getCertificateIssuerCountry(cert: X509Certificate): string | undefined {
  for (const rdn of cert.tbsCertificate.subject) {
    for (const attr of rdn) {
      if (attr.type === "2.5.4.6") {
        const countryCode = attr.value.toString().toUpperCase()
        return countryCode
      }
    }
  }
}

// Map OIDs to their abbreviated names according to RFC 4514 and X.520
export function formatAbbreviatedDN(issuer: any[]): string {
  const abbreviations: Record<string, string> = {
    "1.2.840.113549.1.9.1": "emailAddress", // emailAddress
    "2.5.4.10": "O", // organizationName
    "2.5.4.11": "OU", // organizationalUnitName
    "2.5.4.17": "postalCode", // postalCode
    "2.5.4.20": "telephoneNumber", // telephoneNumber
    "2.5.4.3": "CN", // commonName
    "2.5.4.4": "SN", // surname
    "2.5.4.5": "serialNumber", // serialNumber
    "2.5.4.6": "C", // countryName
    "2.5.4.7": "L", // localityName
    "2.5.4.8": "ST", // stateOrProvinceName
    "2.5.4.9": "street", // streetAddress
  }
  return issuer
    .map((i) =>
      i
        .map(
          (j: { type: string; value: { toString: () => any } }) =>
            `${abbreviations[j.type] || j.type}=${j.value}`,
        )
        .join(", "),
    )
    .join(", ")
}

// Convert DER to PEM format
export function derToPem(der: Uint8Array): string {
  return `-----BEGIN CERTIFICATE-----\n${Buffer.from(der)
    .toString("base64")
    .match(/.{1,64}/g)
    ?.join("\n")}\n-----END CERTIFICATE-----`
}

export const CURVE_TO_KEYSIZE: Record<CurveName, number> = {
  // NIST curves
  "P-256": 256,
  "P-384": 384,
  "P-521": 521,
  // Brainpool curves
  "brainpoolP160r1": 160,
  "brainpoolP160t1": 160,
  "brainpoolP192r1": 192,
  "brainpoolP192t1": 192,
  "brainpoolP224r1": 224,
  "brainpoolP224t1": 224,
  "brainpoolP256r1": 256,
  "brainpoolP256t1": 256,
  "brainpoolP320r1": 320,
  "brainpoolP320t1": 320,
  "brainpoolP384r1": 384,
  "brainpoolP384t1": 384,
  "brainpoolP512r1": 512,
  "brainpoolP512t1": 512,
}

export function getKeySizeFromCurve(curve: CurveName): number {
  if (CURVE_TO_KEYSIZE[curve] === undefined) {
    throw new Error(`Unknown curve: ${curve}`)
  }
  return CURVE_TO_KEYSIZE[curve]
}

export function x509ToPackagedCertificate(x509: X509Certificate): PackagedCertificate {
  const publicKeyOID = x509.tbsCertificate.subjectPublicKeyInfo.algorithm.algorithm
  const publicKeyType =
    OIDS_TO_PUBKEY_TYPE[publicKeyOID as keyof typeof OIDS_TO_PUBKEY_TYPE] ?? publicKeyOID

  const validity = x509.tbsCertificate.validity
  const notBefore = Math.floor(new Date(validity.notBefore.getTime()).getTime() / 1000)
  const notAfter = Math.floor(new Date(validity.notAfter.getTime()).getTime() / 1000)

  const countryCodeAlpha2 = getCertificateIssuerCountry(x509)
  if (!countryCodeAlpha2) throw new Error(`Country is missing from certificate`)
  if (countryCodeAlpha2.length !== 2) throw new Error("Invalid country code")
  const countryCodeAlpha3 = countryCodeAlpha2ToAlpha3(countryCodeAlpha2)

  // Return RSA certificate
  if (publicKeyType === "rsaEncryption") {
    const rsaInfo = getRSAInfo(x509.tbsCertificate.subjectPublicKeyInfo)
    return {
      country: countryCodeAlpha3,
      signature_algorithm: getSignatureAlgorithmType(x509),
      hash_algorithm: getHashAlgorithm(x509),
      public_key: {
        type: "RSA",
        modulus: `0x${rsaInfo.modulus.toString(16)}`,
        exponent: Number(rsaInfo.exponent),
        key_size: getKeySize(x509.tbsCertificate.subjectPublicKeyInfo),
      },
      validity: {
        not_before: notBefore,
        not_after: notAfter,
      },
      authority_key_identifier: getAuthorityKeyId(x509),
      subject_key_identifier: getSubjectKeyId(x509),
      private_key_usage_period: getPrivateKeyUsagePeriod(x509),
    }
  }
  // Return ECDSA certificate
  else if (publicKeyType === "ecPublicKey") {
    const ecdsaInfo = getECDSAInfo(x509.tbsCertificate.subjectPublicKeyInfo)
    return {
      country: countryCodeAlpha3,
      signature_algorithm: getSignatureAlgorithmType(x509),
      hash_algorithm: getHashAlgorithm(x509),
      public_key: {
        type: "EC",
        curve: ecdsaInfo.curve,
        key_size: ecdsaInfo.keySize,
        // The first byte is 0x04, which is the prefix for uncompressed public keys
        // so we get rid of it
        public_key_x: `0x${Buffer.from(
          ecdsaInfo.publicKey.slice(1, ecdsaInfo.publicKey.length / 2 + 1),
        ).toString("hex")}`,
        public_key_y: `0x${Buffer.from(
          ecdsaInfo.publicKey.slice(ecdsaInfo.publicKey.length / 2 + 1),
        ).toString("hex")}`,
      } as ECPublicKey,
      validity: {
        not_before: notBefore,
        not_after: notAfter,
      },
      authority_key_identifier: getAuthorityKeyId(x509),
      subject_key_identifier: getSubjectKeyId(x509),
      private_key_usage_period: getPrivateKeyUsagePeriod(x509),
    }
  } else {
    throw new Error(`Unsupported public key type: ${publicKeyType}`)
  }
}

/**
 * Get the hash algorithm used for signing an x509 certificate
 * @param x509 The x509 certificate
 * @returns Hash algorithm (SHA-1, SHA-224, SHA-256, SHA-384, SHA-512)
 */
// TODO: Throw error if no OID to hash algorithm mapping is found
export function getHashAlgorithm(x509: X509Certificate): HashAlgorithm {
  const oid = x509.tbsCertificate.signature.algorithm
  const signatureAlgo = OIDS_TO_SIG_ALGORITHM[oid as keyof typeof OIDS_TO_SIG_ALGORITHM] ?? oid
  if (signatureAlgo === "rsassa-pss") {
    const pssParams = getRSAPSSParams(x509.tbsCertificate.signature.parameters!)
    return (pssParams.hashAlgorithm.slice(0, 3) +
      "-" +
      pssParams.hashAlgorithm.slice(3)) as HashAlgorithm
  } else {
    return SIG_ALGORITHM_TO_HASH[signatureAlgo as keyof typeof SIG_ALGORITHM_TO_HASH]
  }
}

/**
 * Get the key size from an x509 certificate's subject public key info
 * @param subjectPublicKeyInfo Subject public key info
 * @returns Key size
 */
export function getKeySize(subjectPublicKeyInfo: SubjectPublicKeyInfo): number {
  const rsaInfo = getRSAInfo(subjectPublicKeyInfo)
  return rsaInfo.modulus.toString(2).length
}

/**
 * Convert a PEM certificate to a PackagedCertificate
 * @param pemContent PEM certificate content
 * @returns PackagedCertificate
 */
export function convertPemToPackagedCertificate(pemContent: string): PackagedCertificate {
  try {
    // Remove PEM headers and convert to binary
    const b64 = pemContent.replace(/(-----(BEGIN|END) CERTIFICATE-----|[\n\r])/g, "")
    const binary = Buffer.from(b64, "base64")
    const x509 = AsnParser.parse(binary, X509Certificate)
    return x509ToPackagedCertificate(x509)
  } catch (error) {
    console.error("Error parsing PEM certificate:", error)
    throw new Error("Error parsing PEM certificate")
  }
}

/**
 * Convert one or more PEM certificates to an array of PackagedCertificates
 * @param pemContent PEM certificate content
 * @returns PackagedCertificate
 */
export function convertPemToPackagedCertificates(pemContent: string): PackagedCertificate[] {
  const certificates: PackagedCertificate[] = []
  try {
    // Split the PEM content into individual certificates
    const pemRegex = /(-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/g
    const matches = pemContent.match(pemRegex) || []
    for (const certPem of matches) {
      // Remove PEM headers and convert to binary
      const b64 = certPem.replace(/(-----(BEGIN|END) CERTIFICATE-----|[\n\r])/g, "")
      const binary = Buffer.from(b64, "base64")
      try {
        const x509 = AsnParser.parse(binary, X509Certificate)
        certificates.push(x509ToPackagedCertificate(x509))
      } catch (error) {
        console.error("Error parsing x509 certificate:", error)
      }
    }
  } catch (error) {
    console.error("Error parsing PEM certificates:", error)
    throw new Error("Error parsing PEM certificates")
  }
  return certificates
}
