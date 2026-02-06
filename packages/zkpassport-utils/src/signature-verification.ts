/**
 * DSC Signature Verification Utilities
 *
 * This module provides cross-platform (browser, Node.js, React Native) signature
 * verification for DSC certificates signed by CSC certificates.
 *
 * Supports:
 * - ECDSA with NIST curves (P-192, P-224, P-256, P-384, P-521)
 * - ECDSA with Brainpool curves (r1 variants)
 * - RSA with PKCS#1 v1.5 padding
 * - RSA-PSS
 *
 * Hash algorithms: SHA-1, SHA-224, SHA-256, SHA-384, SHA-512
 */

import { sha1 } from "@noble/hashes/legacy.js"
import { sha224, sha256, sha384, sha512 } from "@noble/hashes/sha2.js"
import { p256, p384, p521 } from "@noble/curves/nist.js"
import { brainpoolP256r1, brainpoolP384r1, brainpoolP512r1 } from "@noble/curves/misc.js"
import { ecdsa, weierstrass } from "@noble/curves/abstract/weierstrass.js"
import type { ECDSA, WeierstrassOpts } from "@noble/curves/abstract/weierstrass.js"
import type { HashAlgorithm, PackagedCertificate, ECPublicKey, RSAPublicKey } from "./types"
import type { DSC } from "./passport/dsc"
import { BRAINPOOL_CURVES, NIST_CURVES } from "./cms/constants"

type HashFunction = (data: Uint8Array) => Uint8Array

const HASH_FUNCTIONS: Record<HashAlgorithm, HashFunction> = {
  "SHA-1": sha1,
  "SHA-224": sha224,
  "SHA-256": sha256,
  "SHA-384": sha384,
  "SHA-512": sha512,
}

// Define brainpool curves that are not in @noble/curves/misc
// Using the constants already defined in cms/constants.ts

// brainpoolP224r1
const brainpoolP224r1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP224r1.p,
  a: BRAINPOOL_CURVES.brainpoolP224r1.a,
  b: BRAINPOOL_CURVES.brainpoolP224r1.b,
  n: BRAINPOOL_CURVES.brainpoolP224r1.n,
  h: BigInt(1),
  Gx: BigInt("0xd9029ad2c7e5cf4340823b2a87dc68c9e4ce3174c1e6efdee12c07d"),
  Gy: BigInt("0x58aa56f772c0726f24c6b89e4ecdac24354b9e99caa3f6d3761402cd"),
}
const brainpoolP224r1Custom: ECDSA = ecdsa(weierstrass(brainpoolP224r1_CURVE), sha224)

// P-192 custom curve (not in @noble/curves)
const p192_CURVE: WeierstrassOpts<bigint> = {
  p: NIST_CURVES["P-192"].p,
  a: NIST_CURVES["P-192"].a,
  b: NIST_CURVES["P-192"].b,
  n: NIST_CURVES["P-192"].n,
  h: BigInt(1),
  Gx: BigInt("0x188da80eb03090f67cbf20eb43a18800f4ff0afd82ff1012"),
  Gy: BigInt("0x07192b95ffc8da78631011ed6b24cdd573f977a11e794811"),
}
const p192Custom: ECDSA = ecdsa(weierstrass(p192_CURVE), sha1)

// P-224 custom curve (not in @noble/curves)
const p224_CURVE: WeierstrassOpts<bigint> = {
  p: NIST_CURVES["P-224"].p,
  a: NIST_CURVES["P-224"].a,
  b: NIST_CURVES["P-224"].b,
  n: NIST_CURVES["P-224"].n,
  h: BigInt(1),
  Gx: BigInt("0xb70e0cbd6bb4bf7f321390b94a03c1d356c21122343280d6115c1d21"),
  Gy: BigInt("0xbd376388b5f723fb4c22dfe6cd4375a05a07476444d5819985007e34"),
}
const p224Custom: ECDSA = ecdsa(weierstrass(p224_CURVE), sha224)

// Map curve names to their ECDSA implementations
const ECDSA_CURVES: Record<string, ECDSA> = {
  "P-192": p192Custom,
  "P-224": p224Custom,
  "P-256": p256,
  "P-384": p384,
  "P-521": p521,
  "brainpoolP224r1": brainpoolP224r1Custom,
  "brainpoolP256r1": brainpoolP256r1,
  "brainpoolP384r1": brainpoolP384r1,
  "brainpoolP512r1": brainpoolP512r1,
}

/**
 * Get reasonable hash algorithms to try based on public key size
 * Returns algorithms in order of likelihood
 */
function getHashAlgorithmsForKeySize(keySizeBits: number): HashAlgorithm[] {
  if (keySizeBits <= 192) {
    return ["SHA-1", "SHA-224", "SHA-256", "SHA-384", "SHA-512"]
  } else if (keySizeBits <= 256) {
    return ["SHA-256", "SHA-1", "SHA-224", "SHA-384", "SHA-512"]
  } else if (keySizeBits <= 384) {
    return ["SHA-384", "SHA-256", "SHA-512", "SHA-1", "SHA-224"]
  } else {
    return ["SHA-512", "SHA-384", "SHA-256", "SHA-1", "SHA-224"]
  }
}

/**
 * Parse an ECDSA signature from DER format to raw r||s format
 */
function parseECDSASignature(signature: Uint8Array, byteSize: number): Uint8Array {
  // Check if already in raw format
  if (signature.length === byteSize * 2) {
    return signature
  }

  // Parse DER format
  if (signature[0] !== 0x30) {
    // Not a valid ASN.1 sequence, return as-is
    return signature
  }

  const innerLengthIndex = signature[1] === signature.length - 2 ? 1 : 2
  const innerLength = signature[innerLengthIndex]

  if (
    signature[innerLengthIndex + 1] !== 0x02 ||
    innerLength !== signature.length - innerLengthIndex - 1
  ) {
    return signature
  }

  const rLength = signature[innerLengthIndex + 2]
  let r = signature.slice(innerLengthIndex + 3, innerLengthIndex + 3 + rLength)

  if (signature[innerLengthIndex + 3 + rLength] !== 0x02) {
    return signature
  }

  const sLength = signature[innerLengthIndex + 3 + rLength + 1]
  let s = signature.slice(
    innerLengthIndex + 3 + rLength + 2,
    innerLengthIndex + 3 + rLength + 2 + sLength,
  )

  // Remove leading zeros
  while (r.length > 0 && r[0] === 0x00) {
    r = r.slice(1)
  }
  while (s.length > 0 && s[0] === 0x00) {
    s = s.slice(1)
  }

  // Pad to expected byte size
  const rPadded = new Uint8Array(byteSize)
  const sPadded = new Uint8Array(byteSize)
  rPadded.set(r, byteSize - r.length)
  sPadded.set(s, byteSize - s.length)

  const result = new Uint8Array(byteSize * 2)
  result.set(rPadded, 0)
  result.set(sPadded, byteSize)
  return result
}

/**
 * Verify an ECDSA signature
 */
export function verifyECDSASignature(
  digest: Uint8Array,
  signature: Uint8Array,
  publicKey: ECPublicKey,
): boolean {
  const curve = ECDSA_CURVES[publicKey.curve]
  if (!curve) {
    return false
  }

  try {
    const byteSize = Math.ceil(publicKey.key_size / 8)
    const parsedSignature = parseECDSASignature(signature, byteSize)

    // Create uncompressed public key (0x04 || x || y)
    const pubKeyX = Buffer.from(publicKey.public_key_x.replace("0x", ""), "hex")
    const pubKeyY = Buffer.from(publicKey.public_key_y.replace("0x", ""), "hex")

    // Pad to expected byte size
    const xPadded = new Uint8Array(byteSize)
    const yPadded = new Uint8Array(byteSize)
    xPadded.set(pubKeyX, byteSize - pubKeyX.length)
    yPadded.set(pubKeyY, byteSize - pubKeyY.length)

    const uncompressedPubKey = new Uint8Array(1 + byteSize * 2)
    uncompressedPubKey[0] = 0x04
    uncompressedPubKey.set(xPadded, 1)
    uncompressedPubKey.set(yPadded, 1 + byteSize)

    return curve.verify(parsedSignature, digest, uncompressedPubKey, {
      prehash: false,
      lowS: false,
    })
  } catch {
    return false
  }
}

// Hash algorithms supported by Web Crypto for RSA signatures
// Note: SHA-1 and SHA-224 are NOT supported by Web Crypto
const WEB_CRYPTO_SUPPORTED_HASH_ALGORITHMS: HashAlgorithm[] = ["SHA-256", "SHA-384", "SHA-512"]

/**
 * Verify an RSA signature using Web Crypto API (works in browser, Node.js, and React Native with polyfill)
 * Falls back to manual verification if Web Crypto is not available or if the hash algorithm is not supported
 *
 * @param message - The original message bytes (unhashed)
 * @param digest - The pre-computed hash of the message (used for manual verification)
 * @param signature - The signature to verify
 * @param publicKey - The RSA public key
 * @param hashAlgorithm - The hash algorithm to use
 * @param isPSS - Whether to use RSA-PSS padding
 */
export async function verifyRSASignature(
  message: Uint8Array,
  digest: Uint8Array,
  signature: Uint8Array,
  publicKey: RSAPublicKey,
  hashAlgorithm: HashAlgorithm,
  isPSS: boolean,
): Promise<boolean> {
  try {
    // Check if the hash algorithm is supported by Web Crypto
    // SHA-1 and SHA-224 are NOT supported, so use manual verification directly
    const isWebCryptoSupported = WEB_CRYPTO_SUPPORTED_HASH_ALGORITHMS.includes(hashAlgorithm)

    if (isWebCryptoSupported) {
      // Try Web Crypto API first (available in browsers, Node.js 15+, and React Native with polyfill)
      const crypto = getCryptoSubtle()
      if (crypto) {
        // Web Crypto expects the original data (not the hash) and will hash it internally
        return await verifyRSAWithWebCrypto(
          message,
          signature,
          publicKey,
          hashAlgorithm,
          isPSS,
          crypto,
        )
      }
    }

    // Fallback to manual RSA verification for:
    // - Environments without Web Crypto
    // - Unsupported hash algorithms (SHA-1, SHA-224)
    // Manual verification uses the pre-computed hash
    return verifyRSAManual(digest, signature, publicKey, hashAlgorithm, isPSS)
  } catch {
    return false
  }
}

/**
 * Convert a number to big-endian bytes (minimal representation, no leading zeros)
 */
function numberToBytesBE(num: number): Uint8Array {
  if (num === 0) return new Uint8Array([0])
  const bytes: number[] = []
  while (num > 0) {
    bytes.unshift(num & 0xff)
    num = num >>> 8
  }
  return new Uint8Array(bytes)
}

/**
 * Get the SubtleCrypto interface from various environments
 */
function getCryptoSubtle(): SubtleCrypto | null {
  // Browser
  if (typeof globalThis !== "undefined" && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle
  }
  // Node.js
  const g = globalThis as unknown as { crypto?: { webcrypto?: { subtle?: SubtleCrypto } } }
  if (typeof globalThis !== "undefined" && g.crypto?.webcrypto?.subtle) {
    return g.crypto.webcrypto.subtle
  }
  return null
}

/**
 * Verify RSA signature using Web Crypto API
 * Web Crypto expects the original data (not the hash) and will hash it internally
 *
 * @param message - The original message bytes (unhashed)
 * @param signature - The signature to verify
 * @param publicKey - The RSA public key
 * @param hashAlgorithm - The hash algorithm that Web Crypto will use internally
 * @param isPSS - Whether to use RSA-PSS padding
 * @param crypto - The SubtleCrypto instance
 */
async function verifyRSAWithWebCrypto(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: RSAPublicKey,
  hashAlgorithm: HashAlgorithm,
  isPSS: boolean,
  crypto: SubtleCrypto,
): Promise<boolean> {
  // Convert modulus to ArrayBuffer
  const modulusBytes = new Uint8Array(Buffer.from(publicKey.modulus.replace("0x", ""), "hex"))

  // Convert exponent to big-endian bytes
  const exponentBytes = numberToBytesBE(publicKey.exponent)

  // Create JWK for the public key
  const jwk: JsonWebKey = {
    kty: "RSA",
    n: base64UrlEncode(modulusBytes),
    e: base64UrlEncode(exponentBytes),
    alg: isPSS
      ? `PS${hashAlgorithm.replace("SHA-", "")}`
      : `RS${hashAlgorithm.replace("SHA-", "")}`,
    ext: true,
  }

  const algorithm: RsaHashedImportParams = isPSS
    ? {
        name: "RSA-PSS",
        hash: { name: hashAlgorithm },
      }
    : {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: hashAlgorithm },
      }

  const verifyAlgorithm: RsaPssParams | Algorithm = isPSS
    ? {
        name: "RSA-PSS",
        saltLength: getHashLength(hashAlgorithm),
      }
    : {
        name: "RSASSA-PKCS1-v1_5",
      }

  try {
    const key = await crypto.importKey("jwk", jwk, algorithm, false, ["verify"])
    // Web Crypto will internally hash the message using the specified hashAlgorithm
    // and then verify the signature against that hash
    const signatureBuffer = new Uint8Array(signature).buffer
    const dataBuffer = new Uint8Array(message).buffer
    const result = await crypto.verify(verifyAlgorithm, key, signatureBuffer, dataBuffer)
    return result
  } catch {
    // This can fail for unsupported algorithms (e.g., SHA-224 is not supported by Web Crypto for RSA)
    // or for invalid keys/signatures - continue to next algorithm in the brute force loop
    return false
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  const base64 = Buffer.from(bytes).toString("base64")
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

function getHashLength(hashAlgorithm: HashAlgorithm): number {
  switch (hashAlgorithm) {
    case "SHA-1":
      return 20
    case "SHA-224":
      return 28
    case "SHA-256":
      return 32
    case "SHA-384":
      return 48
    case "SHA-512":
      return 64
    default:
      return 32
  }
}

/**
 * Manual RSA signature verification (fallback when Web Crypto is not available)
 * This implements RSA PKCS#1 v1.5 and PSS verification using bigint arithmetic
 * Based on RFC 8017 and RustCrypto/RSA implementation patterns
 */
function verifyRSAManual(
  digest: Uint8Array,
  signature: Uint8Array,
  publicKey: RSAPublicKey,
  hashAlgorithm: HashAlgorithm,
  isPSS: boolean,
): boolean {
  try {
    const modulus = BigInt(publicKey.modulus)
    const exponent = BigInt(publicKey.exponent)
    const modulusBytes = Math.ceil(publicKey.key_size / 8)

    // Step 1: Signature length check (RFC 8017 Section 8.2.2 Step 1)
    // The signature must be exactly k octets, where k is the length of the modulus in bytes
    if (signature.length !== modulusBytes) {
      // Try to handle signatures that are shorter (missing leading zeros)
      if (signature.length < modulusBytes) {
        const paddedSig = new Uint8Array(modulusBytes)
        paddedSig.set(signature, modulusBytes - signature.length)
        signature = paddedSig
      } else {
        return false
      }
    }

    // Convert signature to bigint
    let sigInt = BigInt(0)
    for (const byte of signature) {
      sigInt = (sigInt << BigInt(8)) | BigInt(byte)
    }

    // Step 2: Check signature is in valid range [0, n-1]
    if (sigInt >= modulus) {
      return false
    }

    // Step 3: RSA verification primitive RSAVP1: m = s^e mod n
    const message = modPow(sigInt, exponent, modulus)

    // Convert message back to bytes (I2OSP - Integer to Octet String Primitive)
    const messageBytes = new Uint8Array(modulusBytes)
    let temp = message
    for (let i = modulusBytes - 1; i >= 0; i--) {
      messageBytes[i] = Number(temp & BigInt(0xff))
      temp = temp >> BigInt(8)
    }

    if (isPSS) {
      // PSS verification with auto salt length detection
      return verifyPSSPadding(messageBytes, digest, hashAlgorithm, publicKey.key_size)
    } else {
      return verifyPKCS1Padding(messageBytes, digest, hashAlgorithm)
    }
  } catch {
    return false
  }
}

/**
 * Modular exponentiation using square-and-multiply
 */
function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  if (modulus === BigInt(1)) return BigInt(0)
  let result = BigInt(1)
  base = base % modulus
  while (exponent > BigInt(0)) {
    if (exponent % BigInt(2) === BigInt(1)) {
      result = (result * base) % modulus
    }
    exponent = exponent >> BigInt(1)
    base = (base * base) % modulus
  }
  return result
}

// DigestInfo prefixes for PKCS#1 v1.5 (DER encoded)
const DIGEST_INFO_PREFIXES: Record<HashAlgorithm, Uint8Array> = {
  "SHA-1": new Uint8Array([
    0x30, 0x21, 0x30, 0x09, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x05, 0x00, 0x04, 0x14,
  ]),
  "SHA-224": new Uint8Array([
    0x30, 0x2d, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x04, 0x05,
    0x00, 0x04, 0x1c,
  ]),
  "SHA-256": new Uint8Array([
    0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05,
    0x00, 0x04, 0x20,
  ]),
  "SHA-384": new Uint8Array([
    0x30, 0x41, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02, 0x05,
    0x00, 0x04, 0x30,
  ]),
  "SHA-512": new Uint8Array([
    0x30, 0x51, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03, 0x05,
    0x00, 0x04, 0x40,
  ]),
}

// Minimum padding length for PKCS#1 v1.5 (RFC 8017 Section 9.2)
// The padding string PS must be at least 8 bytes
const MIN_PKCS1_PADDING_LENGTH = 8

// DigestInfo prefixes WITHOUT NULL parameter (some implementations omit it)
// This is for compatibility - some signers produce signatures without the NULL
const DIGEST_INFO_PREFIXES_NO_NULL: Record<HashAlgorithm, Uint8Array> = {
  "SHA-1": new Uint8Array([
    0x30, 0x1f, 0x30, 0x07, 0x06, 0x05, 0x2b, 0x0e, 0x03, 0x02, 0x1a, 0x04, 0x14,
  ]),
  "SHA-224": new Uint8Array([
    0x30, 0x2b, 0x30, 0x0b, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x04, 0x04,
    0x1c,
  ]),
  "SHA-256": new Uint8Array([
    0x30, 0x2f, 0x30, 0x0b, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x04,
    0x20,
  ]),
  "SHA-384": new Uint8Array([
    0x30, 0x3f, 0x30, 0x0b, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02, 0x04,
    0x30,
  ]),
  "SHA-512": new Uint8Array([
    0x30, 0x4f, 0x30, 0x0b, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03, 0x04,
    0x40,
  ]),
}

/**
 * Verify PKCS#1 v1.5 padding according to RFC 8017 Section 8.2.2
 * EMSA-PKCS1-v1_5 verification
 */
function verifyPKCS1Padding(
  decryptedMessage: Uint8Array,
  expectedHash: Uint8Array,
  hashAlgorithm: HashAlgorithm,
): boolean {
  // PKCS#1 v1.5 format: 0x00 0x01 [0xFF padding] 0x00 [DigestInfo] [Hash]
  // Step 1: Check the first two bytes
  if (decryptedMessage[0] !== 0x00 || decryptedMessage[1] !== 0x01) {
    return false
  }

  // Step 2: Find the 0x00 separator after the padding
  let separatorIndex = 2
  while (separatorIndex < decryptedMessage.length && decryptedMessage[separatorIndex] === 0xff) {
    separatorIndex++
  }

  // Step 3: Check minimum padding length (RFC 8017 requires at least 8 bytes of 0xFF)
  const paddingLength = separatorIndex - 2
  if (paddingLength < MIN_PKCS1_PADDING_LENGTH) {
    return false
  }

  // Step 4: Check the 0x00 separator exists
  if (separatorIndex >= decryptedMessage.length || decryptedMessage[separatorIndex] !== 0x00) {
    return false
  }

  separatorIndex++ // Move past the 0x00 separator

  // Step 5: Extract and verify DigestInfo + Hash
  const digestInfo = decryptedMessage.slice(separatorIndex)

  // Try with standard DigestInfo prefix (with NULL parameter)
  const prefixWithNull = DIGEST_INFO_PREFIXES[hashAlgorithm]
  if (verifyDigestInfo(digestInfo, expectedHash, prefixWithNull)) {
    return true
  }

  // Try with DigestInfo prefix without NULL parameter (for compatibility)
  const prefixNoNull = DIGEST_INFO_PREFIXES_NO_NULL[hashAlgorithm]
  if (verifyDigestInfo(digestInfo, expectedHash, prefixNoNull)) {
    return true
  }

  return false
}

/**
 * Verify DigestInfo structure matches the expected prefix and hash
 */
function verifyDigestInfo(
  digestInfo: Uint8Array,
  expectedHash: Uint8Array,
  prefix: Uint8Array,
): boolean {
  if (digestInfo.length !== prefix.length + expectedHash.length) {
    return false
  }

  let result = 0

  // Check prefix
  for (let i = 0; i < prefix.length; i++) {
    result |= digestInfo[i] ^ prefix[i]
  }

  // Check hash
  for (let i = 0; i < expectedHash.length; i++) {
    result |= digestInfo[prefix.length + i] ^ expectedHash[i]
  }

  return result === 0
}

/**
 * Verify PSS padding according to RFC 8017 Section 9.1.2
 * EMSA-PSS-VERIFY operation with auto salt length detection
 */
function verifyPSSPadding(
  em: Uint8Array,
  mHash: Uint8Array,
  hashAlgorithm: HashAlgorithm,
  modBits: number,
): boolean {
  const hashFunc = HASH_FUNCTIONS[hashAlgorithm]
  const hLen = getHashLength(hashAlgorithm)

  // emBits = modBits - 1 (RFC 8017 Section 8.1.2)
  const emBits = modBits - 1
  const emLen = Math.ceil(emBits / 8)

  // Step 3: Check minimum length
  // emLen must be at least hLen + sLen + 2, but we don't know sLen yet
  // Minimum is when sLen = 0: emLen >= hLen + 2
  if (emLen < hLen + 2) {
    return false
  }

  // Adjust EM if it's longer than emLen (can happen with certain key sizes)
  const emToUse = em.length > emLen ? em.slice(em.length - emLen) : em
  if (emToUse.length < emLen) {
    return false
  }

  // Step 4: Check trailing byte (rightmost octet must be 0xbc)
  if (emToUse[emLen - 1] !== 0xbc) {
    return false
  }

  // Step 5: Split EM into maskedDB and H
  const dbLen = emLen - hLen - 1
  const maskedDB = emToUse.slice(0, dbLen)
  const H = emToUse.slice(dbLen, dbLen + hLen)

  // Step 6: Check leading bits of maskedDB
  // The leftmost 8*emLen - emBits bits must be zero
  const leadingBits = 8 * emLen - emBits
  const topMask = 0xff >> leadingBits
  if ((maskedDB[0] & ~topMask) !== 0) {
    return false
  }

  // Step 7: Generate dbMask using MGF1
  const dbMask = mgf1(H, dbLen, hashFunc)

  // Step 8: Recover DB = maskedDB XOR dbMask
  const DB = new Uint8Array(dbLen)
  for (let i = 0; i < dbLen; i++) {
    DB[i] = maskedDB[i] ^ dbMask[i]
  }

  // Step 9: Clear the leftmost 8*emLen - emBits bits
  DB[0] &= topMask

  // Step 10: Find the 0x01 separator and auto-detect salt length
  // DB format: [0x00...] 0x01 [salt]
  // Find the position of 0x01 separator
  let separatorPos = -1
  for (let i = 0; i < dbLen; i++) {
    if (DB[i] === 0x01) {
      separatorPos = i
      break
    } else if (DB[i] !== 0x00) {
      // All bytes before 0x01 must be 0x00
      return false
    }
  }

  if (separatorPos === -1) {
    return false
  }

  // Auto-detected salt length
  const sLen = dbLen - separatorPos - 1

  // Sanity check: salt length should not be negative
  if (sLen < 0) {
    return false
  }

  // Step 11: Extract salt
  const salt = DB.slice(separatorPos + 1)

  // Step 12: Compute M' = (0x00 * 8) || mHash || salt
  const mPrime = new Uint8Array(8 + hLen + sLen)
  // First 8 bytes are 0x00 (already initialized to zero)
  mPrime.set(mHash, 8)
  if (sLen > 0) {
    mPrime.set(salt, 8 + hLen)
  }

  // Step 13: Compute H' = Hash(M')
  const HPrime = hashFunc(mPrime)

  // Step 14: Compare H and H' using constant-time comparison
  if (H.length !== HPrime.length) {
    return false
  }

  let result = 0
  for (let i = 0; i < H.length; i++) {
    result |= H[i] ^ HPrime[i]
  }

  return result === 0
}

/**
 * MGF1 (Mask Generation Function 1)
 */
function mgf1(seed: Uint8Array, maskLen: number, hashFunc: HashFunction): Uint8Array {
  const hLen = hashFunc(new Uint8Array(0)).length
  const mask = new Uint8Array(maskLen)
  let offset = 0

  for (let counter = 0; offset < maskLen; counter++) {
    const C = new Uint8Array(4)
    C[0] = (counter >> 24) & 0xff
    C[1] = (counter >> 16) & 0xff
    C[2] = (counter >> 8) & 0xff
    C[3] = counter & 0xff

    const input = new Uint8Array(seed.length + 4)
    input.set(seed)
    input.set(C, seed.length)

    const hash = hashFunc(input)
    const copyLen = Math.min(hLen, maskLen - offset)
    mask.set(hash.slice(0, copyLen), offset)
    offset += copyLen
  }

  return mask
}

/**
 * Verify a DSC signature against a CSC certificate's public key
 * Tries all hash algorithms if the specific one fails
 */
export async function verifyDscSignature(dsc: DSC, csc: PackagedCertificate): Promise<boolean> {
  const tbsBytes = dsc.tbs.bytes.toUInt8Array()
  const signature = dsc.signature.toUInt8Array()

  // Determine signature type from CSC
  const isECDSA = csc.public_key.type === "EC"
  const isPSS = csc.signature_algorithm === "RSA-PSS"

  // Get the hash algorithms to try, ordered by likelihood based on key size
  const keySizeBits = csc.public_key.key_size
  const hashAlgorithmsToTry = getHashAlgorithmsForKeySize(keySizeBits)

  // Try the declared hash algorithm first if available
  const declaredHashAlg = csc.hash_algorithm
  if (declaredHashAlg && !hashAlgorithmsToTry.includes(declaredHashAlg)) {
    hashAlgorithmsToTry.unshift(declaredHashAlg)
  } else if (declaredHashAlg) {
    // Move declared algorithm to front
    const index = hashAlgorithmsToTry.indexOf(declaredHashAlg)
    if (index > 0) {
      hashAlgorithmsToTry.splice(index, 1)
      hashAlgorithmsToTry.unshift(declaredHashAlg)
    }
  }

  // Try each hash algorithm
  for (const hashAlgorithm of hashAlgorithmsToTry) {
    const hashFunc = HASH_FUNCTIONS[hashAlgorithm]
    if (!hashFunc) continue

    const tbsHash = hashFunc(tbsBytes)

    if (isECDSA) {
      const ecPublicKey = csc.public_key as ECPublicKey
      if (verifyECDSASignature(tbsHash, signature, ecPublicKey)) {
        return true
      }
    } else {
      const rsaPublicKey = csc.public_key as RSAPublicKey
      // Pass both tbsBytes (for Web Crypto) and tbsHash (for manual verification)
      if (
        await verifyRSASignature(tbsBytes, tbsHash, signature, rsaPublicKey, hashAlgorithm, isPSS)
      ) {
        return true
      }
    }
  }

  return false
}

/**
 * Verify a DSC signature using the original TBS bytes (for Web Crypto API)
 * This is more reliable than using pre-hashed data
 */
export async function verifyDscSignatureWithTbs(
  tbsBytes: Uint8Array,
  signature: Uint8Array,
  csc: PackagedCertificate,
): Promise<boolean> {
  const isECDSA = csc.public_key.type === "EC"
  const isPSS = csc.signature_algorithm === "RSA-PSS"

  const keySizeBits = csc.public_key.key_size
  const hashAlgorithmsToTry = getHashAlgorithmsForKeySize(keySizeBits)

  // Try the declared hash algorithm first
  const declaredHashAlg = csc.hash_algorithm
  if (declaredHashAlg) {
    const index = hashAlgorithmsToTry.indexOf(declaredHashAlg)
    if (index > 0) {
      hashAlgorithmsToTry.splice(index, 1)
      hashAlgorithmsToTry.unshift(declaredHashAlg)
    } else if (index === -1) {
      hashAlgorithmsToTry.unshift(declaredHashAlg)
    }
  }

  for (const hashAlgorithm of hashAlgorithmsToTry) {
    const hashFunc = HASH_FUNCTIONS[hashAlgorithm]
    if (!hashFunc) continue

    const tbsHash = hashFunc(tbsBytes)

    if (isECDSA) {
      const ecPublicKey = csc.public_key as ECPublicKey
      if (verifyECDSASignature(tbsHash, signature, ecPublicKey)) {
        return true
      }
    } else {
      const rsaPublicKey = csc.public_key as RSAPublicKey
      // Pass both tbsBytes (for Web Crypto) and tbsHash (for manual verification)
      if (
        await verifyRSASignature(tbsBytes, tbsHash, signature, rsaPublicKey, hashAlgorithm, isPSS)
      ) {
        return true
      }
    }
  }

  return false
}
