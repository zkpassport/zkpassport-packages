import { p256, p384, p521 } from "@noble/curves/nist.js"
import { hexToBytes } from "@noble/hashes/utils.js"
import type { CHash } from "@noble/hashes/utils.js"
import { ECPrivateKey } from "@peculiar/asn1-ecc"
import { RSAPrivateKey } from "@peculiar/asn1-rsa"
import { AsnConvert } from "@peculiar/asn1-schema"
import { fromArrayBufferToBigInt, modPow, numberToBytesBE } from "@zkpassport/utils"
import type { HashAlgorithm } from "../passport-generator"
import { HASH_FUNCTIONS } from "../passport-generator/sod"

export type SignatureScheme = "rsa-pkcs1" | "rsa-pss" | "ecdsa-p256" | "ecdsa-p384" | "ecdsa-p521"

/**
 * Sign a message without WebCrypto, deterministically. The private key is a DER RSAPrivateKey
 * (PKCS #1) for RSA and a DER ECPrivateKey (SEC 1) for ECDSA. ECDSA signatures are r ‖ s.
 */
export function sign(
  message: Uint8Array,
  privateKey: Uint8Array,
  scheme: SignatureScheme,
  hashAlgorithm: HashAlgorithm,
): Uint8Array {
  const hash = HASH_FUNCTIONS[hashAlgorithm]

  if (scheme === "rsa-pkcs1" || scheme === "rsa-pss") {
    const key = AsnConvert.parse(privateKey, RSAPrivateKey)
    const modulusBits = fromArrayBufferToBigInt(key.modulus).toString(2).length
    const encoded =
      scheme === "rsa-pkcs1"
        ? encodePkcs1(hash(message), hashAlgorithm, Math.ceil(modulusBits / 8))
        : encodePss(hash(message), hash, modulusBits - 1)
    return rsaSign(encoded, key, Math.ceil(modulusBits / 8))
  }

  const { privateKey: secretKey } = AsnConvert.parse(privateKey, ECPrivateKey)
  return CURVES[scheme].sign(hash(message), new Uint8Array(secretKey.buffer), {
    prehash: false,
    lowS: false,
    format: "compact",
  })
}

/** EMSA-PKCS1-v1_5 (RFC 8017, section 9.2) */
function encodePkcs1(digest: Uint8Array, hashAlgorithm: HashAlgorithm, length: number) {
  const digestInfo = concat(hexToBytes(DIGEST_INFO_PREFIXES[hashAlgorithm]), digest)
  const padding = new Uint8Array(length - digestInfo.length - 3).fill(0xff)
  return concat(new Uint8Array([0x00, 0x01]), padding, new Uint8Array([0x00]), digestInfo)
}

/**
 * EMSA-PSS (RFC 8017, section 9.1.1), with MGF1 over the same hash and a salt as long as the hash.
 * The salt is the hash of the message hash, so the same message always gets the same signature.
 */
function encodePss(messageHash: Uint8Array, hash: CHash, encodedBits: number) {
  const encodedLength = Math.ceil(encodedBits / 8)
  const salt = hash(messageHash)
  const h = hash(concat(new Uint8Array(8), messageHash, salt))

  const padding = new Uint8Array(encodedLength - salt.length - h.length - 2)
  const db = concat(padding, new Uint8Array([0x01]), salt)
  const mask = mgf1(h, db.length, hash)
  const maskedDb = db.map((byte, index) => byte ^ mask[index])
  maskedDb[0] &= 0xff >>> (8 * encodedLength - encodedBits)

  return concat(maskedDb, h, new Uint8Array([0xbc]))
}

function mgf1(seed: Uint8Array, length: number, hash: CHash) {
  const blocks = []
  for (let counter = 0; blocks.length * hash.outputLen < length; counter++) {
    blocks.push(hash(concat(seed, numberToBytesBE(counter, 4))))
  }
  return concat(...blocks).slice(0, length)
}

/** RSASP1 with the Chinese remainder theorem (RFC 8017, section 5.2.1) */
function rsaSign(encoded: Uint8Array, key: RSAPrivateKey, length: number) {
  const message = fromArrayBufferToBigInt(new Uint8Array(encoded).buffer)
  const p = fromArrayBufferToBigInt(key.prime1)
  const q = fromArrayBufferToBigInt(key.prime2)

  const s1 = modPow(message, fromArrayBufferToBigInt(key.exponent1), p)
  const s2 = modPow(message, fromArrayBufferToBigInt(key.exponent2), q)
  const h = (((fromArrayBufferToBigInt(key.coefficient) * (s1 - s2)) % p) + p) % p
  return numberToBytesBE(s2 + h * q, length)
}

function concat(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

const CURVES = { "ecdsa-p256": p256, "ecdsa-p384": p384, "ecdsa-p521": p521 }

// The DER DigestInfo before the digest (RFC 8017, section 9.2, note 1)
const DIGEST_INFO_PREFIXES: Record<HashAlgorithm, string> = {
  "SHA-1": "3021300906052b0e03021a05000414",
  "SHA-224": "302d300d06096086480165030402040500041c",
  "SHA-256": "3031300d060960864801650304020105000420",
  "SHA-384": "3041300d060960864801650304020205000430",
  "SHA-512": "3051300d060960864801650304020305000440",
}
