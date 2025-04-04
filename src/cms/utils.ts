import { p256 } from "@noble/curves/p256"
import { p384 } from "@noble/curves/p384"
import { p521 } from "@noble/curves/p521"
import { ECParameters } from "@peculiar/asn1-ecc"
import { RSAPublicKey, RsaSaPssParams } from "@peculiar/asn1-rsa"
import { AsnParser } from "@peculiar/asn1-schema"
import {
  AlgorithmIdentifier,
  AuthorityKeyIdentifier,
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
} from "./constants"
import type { DigestAlgorithm } from "./types"

// TODO: Consider throwing an error or returning undefined if curve is not found
export function getCurveName(ecParams: ECParameters): string {
  if (ecParams.namedCurve) {
    return CURVE_OIDS[ecParams.namedCurve as keyof typeof CURVE_OIDS] ?? ""
  }
  if (!ecParams.specifiedCurve) {
    return ""
  }
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
      return BRAINPOOL_CURVES_ABBR[key as keyof typeof BRAINPOOL_CURVES_ABBR]
    }
  }
  return `unknown curve`
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
  curve: string
  publicKey: Uint8Array
} {
  const parsedParams = AsnParser.parse(subjectPublicKeyInfo.algorithm.parameters!, ECParameters)
  return {
    curve: getCurveName(parsedParams),
    publicKey: new Uint8Array(subjectPublicKeyInfo.subjectPublicKey),
  }
}

export function getRSAPSSParams(signatureAlgorithm: AlgorithmIdentifier): {
  hashAlgorithm: DigestAlgorithm
  saltLength: number
  maskGenAlgorithm: string
} {
  const parsedKey = AsnParser.parse(signatureAlgorithm.parameters!, RsaSaPssParams)
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

// TODO: Consider using a different term other than "key profile"
export function getKeyProfile(cert: X509Certificate): string {
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
    const curve = getCurveName(AsnParser.parse(spki.algorithm.parameters!, ECParameters))
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
  return `???`
}

// TODO: Consider throwing and error or returning undefined instead of ""?
export function getSignatureAlgorithmType(signatureAlgorithm: string): "RSA" | "ECDSA" | "" {
  if (signatureAlgorithm.toLowerCase().includes("rsa")) {
    return "RSA"
  } else if (signatureAlgorithm.toLowerCase().includes("ecdsa")) {
    return "ECDSA"
  }
  return ""
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
