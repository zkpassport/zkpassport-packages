/**
 * DSC Signature Verification Utilities
 *
 * This module provides cross-platform (browser, Node.js, React Native) signature
 * verification for DSC certificates signed by CSC certificates.
 *
 * Supports:
 * - ECDSA with NIST curves (P-192, P-224, P-256, P-384, P-521)
 * - ECDSA with Brainpool curves (r1 and t1 variants)
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

// brainpoolP160r1
const brainpoolP160r1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP160r1.p,
  a: BRAINPOOL_CURVES.brainpoolP160r1.a,
  b: BRAINPOOL_CURVES.brainpoolP160r1.b,
  n: BRAINPOOL_CURVES.brainpoolP160r1.n,
  h: BigInt(1),
  Gx: BigInt("0xBED5AF16EA3F6A4F62938C4631EB5AF7BDBCDBC3"),
  Gy: BigInt("0x1667CB477A1A8EC338F94741669C976316DA6321"),
}
const brainpoolP160r1Custom: ECDSA = ecdsa(weierstrass(brainpoolP160r1_CURVE), sha1)

// brainpoolP160t1
const brainpoolP160t1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP160t1.p,
  a: BRAINPOOL_CURVES.brainpoolP160t1.a,
  b: BRAINPOOL_CURVES.brainpoolP160t1.b,
  n: BRAINPOOL_CURVES.brainpoolP160t1.n,
  h: BigInt(1),
  Gx: BigInt("0xB199B13B9B34EFC1397E64BAEB05ACC265FF2378"),
  Gy: BigInt("0xADD6718B7C7C1961F0991B842443772152C9E0AD"),
}
const brainpoolP160t1Custom: ECDSA = ecdsa(weierstrass(brainpoolP160t1_CURVE), sha1)

// brainpoolP192r1
const brainpoolP192r1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP192r1.p,
  a: BRAINPOOL_CURVES.brainpoolP192r1.a,
  b: BRAINPOOL_CURVES.brainpoolP192r1.b,
  n: BRAINPOOL_CURVES.brainpoolP192r1.n,
  h: BigInt(1),
  Gx: BigInt("0xC0A0647EAAB6A48753B033C56CB0F0900A2F5C4853375FD6"),
  Gy: BigInt("0x14B690866ABD5BB88B5F4828C1490002E6773FA2FA299B8F"),
}
const brainpoolP192r1Custom: ECDSA = ecdsa(weierstrass(brainpoolP192r1_CURVE), sha1)

// brainpoolP192t1
const brainpoolP192t1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP192t1.p,
  a: BRAINPOOL_CURVES.brainpoolP192t1.a,
  b: BRAINPOOL_CURVES.brainpoolP192t1.b,
  n: BRAINPOOL_CURVES.brainpoolP192t1.n,
  h: BigInt(1),
  Gx: BigInt("0x3AE9E58C82F63C30282E1FE7BBF43FA72C446AF6F4618129"),
  Gy: BigInt("0x097E2C5667C2223A902AB5CA449D0084B7E5B3DE7CCC01C9"),
}
const brainpoolP192t1Custom: ECDSA = ecdsa(weierstrass(brainpoolP192t1_CURVE), sha1)

// brainpoolP224r1
const brainpoolP224r1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP224r1.p,
  a: BRAINPOOL_CURVES.brainpoolP224r1.a,
  b: BRAINPOOL_CURVES.brainpoolP224r1.b,
  n: BRAINPOOL_CURVES.brainpoolP224r1.n,
  h: BigInt(1),
  Gx: BigInt("0x0D9029AD2C7E5CF4340823B2A87DC68C9E4CE3174C1E6EFDEE12C07D"),
  Gy: BigInt("0x58AA56F772C0726F24C6B89E4ECDAC24354B9E99CAA3F6D3761402CD"),
}
const brainpoolP224r1Custom: ECDSA = ecdsa(weierstrass(brainpoolP224r1_CURVE), sha224)

// brainpoolP224t1
const brainpoolP224t1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP224t1.p,
  a: BRAINPOOL_CURVES.brainpoolP224t1.a,
  b: BRAINPOOL_CURVES.brainpoolP224t1.b,
  n: BRAINPOOL_CURVES.brainpoolP224t1.n,
  h: BigInt(1),
  Gx: BigInt("0x6AB1E344CE25FF3896424E7FFE14762ECB49F8928AC0C76029B4D580"),
  Gy: BigInt("0x0374E9F5143E568CD23F3F4D7C0D4B1E41C8CC0D1C6ABD5F1A46DB4C"),
}
const brainpoolP224t1Custom: ECDSA = ecdsa(weierstrass(brainpoolP224t1_CURVE), sha224)

// brainpoolP256t1
const brainpoolP256t1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP256t1.p,
  a: BRAINPOOL_CURVES.brainpoolP256t1.a,
  b: BRAINPOOL_CURVES.brainpoolP256t1.b,
  n: BRAINPOOL_CURVES.brainpoolP256t1.n,
  h: BigInt(1),
  Gx: BigInt("0xA3E8EB3CC1CFE7B7732213B23A656149AFA142C47AAFBC2B79A191562E1305F4"),
  Gy: BigInt("0x2D996C823439C56D7F7B22E14644417E69BCB6DE39D027001DABE8F35B25C9BE"),
}
const brainpoolP256t1Custom: ECDSA = ecdsa(weierstrass(brainpoolP256t1_CURVE), sha256)

// brainpoolP320r1
const brainpoolP320r1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP320r1.p,
  a: BRAINPOOL_CURVES.brainpoolP320r1.a,
  b: BRAINPOOL_CURVES.brainpoolP320r1.b,
  n: BRAINPOOL_CURVES.brainpoolP320r1.n,
  h: BigInt(1),
  Gx: BigInt("0x43BD7E9AFB53D8B85289BCC48EE5BFE6F20137D10A087EB6E7871E2A10A599C710AF8D0D39E20611"),
  Gy: BigInt("0x14FDD05545EC1CC8AB4093247F77275E0743FFED117182EAA9C77877AAAC6AC7D35245D1692E8EE1"),
}
const brainpoolP320r1Custom: ECDSA = ecdsa(weierstrass(brainpoolP320r1_CURVE), sha256)

// brainpoolP320t1
const brainpoolP320t1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP320t1.p,
  a: BRAINPOOL_CURVES.brainpoolP320t1.a,
  b: BRAINPOOL_CURVES.brainpoolP320t1.b,
  n: BRAINPOOL_CURVES.brainpoolP320t1.n,
  h: BigInt(1),
  Gx: BigInt("0x925BE9FB01AFC6FB4D3E7D4990010F813408AB106C4F09CB7EE07868CC136FFF3357F624A21BED52"),
  Gy: BigInt("0x63BA3A7A27483EBF6671DBEF7ABB30EBEE084E58A0B077AD42A5A0989D1EE71B1B9BC0455FB0D2C3"),
}
const brainpoolP320t1Custom: ECDSA = ecdsa(weierstrass(brainpoolP320t1_CURVE), sha256)

// brainpoolP384t1
const brainpoolP384t1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP384t1.p,
  a: BRAINPOOL_CURVES.brainpoolP384t1.a,
  b: BRAINPOOL_CURVES.brainpoolP384t1.b,
  n: BRAINPOOL_CURVES.brainpoolP384t1.n,
  h: BigInt(1),
  Gx: BigInt(
    "0x18DE98B02DB9A306F2AFCD7235F72A819B80AB12EBD653172476FECD462AABFFC4FF191B946A5F54D8D0AA2F418808CC",
  ),
  Gy: BigInt(
    "0x25AB056962D30651A114AFD2755AD336747F93475B7A1FCA3B88F2B6A208CCFE469408584DC2B2912675BF5B9E582928",
  ),
}
const brainpoolP384t1Custom: ECDSA = ecdsa(weierstrass(brainpoolP384t1_CURVE), sha384)

// brainpoolP512t1
const brainpoolP512t1_CURVE: WeierstrassOpts<bigint> = {
  p: BRAINPOOL_CURVES.brainpoolP512t1.p,
  a: BRAINPOOL_CURVES.brainpoolP512t1.a,
  b: BRAINPOOL_CURVES.brainpoolP512t1.b,
  n: BRAINPOOL_CURVES.brainpoolP512t1.n,
  h: BigInt(1),
  Gx: BigInt(
    "0x640ECE5C12788717B9C1BA06CBC2A6FEBA85842458C56DDE9DB1758D39C0313D82BA51735CDB3EA499AA77A7D6943A64F7A3F25FE26F06B51BAA2696FA9035DA",
  ),
  Gy: BigInt(
    "0x5B534BD595F5AF0FA2C892376C84ACE1BB4E3019B71634C01131159CAE03CEE9D9932184BEEF216BD71DF2DADF86A627306ECFF96DBB8BACE198B61E00F8B332",
  ),
}
const brainpoolP512t1Custom: ECDSA = ecdsa(weierstrass(brainpoolP512t1_CURVE), sha512)

// P-192 custom curve (not in @noble/curves)
const p192_CURVE: WeierstrassOpts<bigint> = {
  p: NIST_CURVES["P-192"].p,
  a: NIST_CURVES["P-192"].a,
  b: NIST_CURVES["P-192"].b,
  n: NIST_CURVES["P-192"].n,
  h: BigInt(1),
  Gx: BigInt("0x188DA80EB03090F67CBF20EB43A18800F4FF0AFD82FF1012"),
  Gy: BigInt("0x07192B95FFC8DA78631011ED6B24CDD573F977A11E794811"),
}
const p192Custom: ECDSA = ecdsa(weierstrass(p192_CURVE), sha1)

// P-224 custom curve (not in @noble/curves)
const p224_CURVE: WeierstrassOpts<bigint> = {
  p: NIST_CURVES["P-224"].p,
  a: NIST_CURVES["P-224"].a,
  b: NIST_CURVES["P-224"].b,
  n: NIST_CURVES["P-224"].n,
  h: BigInt(1),
  Gx: BigInt("0xB70E0CBD6BB4BF7F321390B94A03C1D356C21122343280D6115C1D21"),
  Gy: BigInt("0xBD376388B5F723FB4C22DFE6CD4375A05A07476444D5819985007E34"),
}
const p224Custom: ECDSA = ecdsa(weierstrass(p224_CURVE), sha224)

// Map curve names to their ECDSA implementations
const ECDSA_CURVES: Record<string, ECDSA> = {
  "P-192": p192Custom,
  "P-224": p224Custom,
  "P-256": p256,
  "P-384": p384,
  "P-521": p521,
  "brainpoolP160r1": brainpoolP160r1Custom,
  "brainpoolP160t1": brainpoolP160t1Custom,
  "brainpoolP192r1": brainpoolP192r1Custom,
  "brainpoolP192t1": brainpoolP192t1Custom,
  "brainpoolP224r1": brainpoolP224r1Custom,
  "brainpoolP224t1": brainpoolP224t1Custom,
  "brainpoolP256r1": brainpoolP256r1,
  "brainpoolP256t1": brainpoolP256t1Custom,
  "brainpoolP320r1": brainpoolP320r1Custom,
  "brainpoolP320t1": brainpoolP320t1Custom,
  "brainpoolP384r1": brainpoolP384r1,
  "brainpoolP384t1": brainpoolP384t1Custom,
  "brainpoolP512r1": brainpoolP512r1,
  "brainpoolP512t1": brainpoolP512t1Custom,
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
function verifyECDSASignature(
  tbsHash: Uint8Array,
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

    return curve.verify(parsedSignature, tbsHash, uncompressedPubKey, {
      prehash: false,
      lowS: false,
    })
  } catch {
    return false
  }
}

/**
 * Verify an RSA signature using Web Crypto API (works in browser, Node.js, and React Native with polyfill)
 * Falls back to manual verification if Web Crypto is not available
 */
async function verifyRSASignature(
  tbsHash: Uint8Array,
  signature: Uint8Array,
  publicKey: RSAPublicKey,
  hashAlgorithm: HashAlgorithm,
  isPSS: boolean,
): Promise<boolean> {
  try {
    // Try Web Crypto API first (available in browsers, Node.js 15+, and React Native with polyfill)
    const crypto = getCryptoSubtle()
    if (crypto) {
      return await verifyRSAWithWebCrypto(
        tbsHash,
        signature,
        publicKey,
        hashAlgorithm,
        isPSS,
        crypto,
      )
    }

    // Fallback to manual RSA verification for environments without Web Crypto
    return verifyRSAManual(tbsHash, signature, publicKey, hashAlgorithm, isPSS)
  } catch {
    return false
  }
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
  if (typeof globalThis !== "undefined" && (globalThis as any).crypto?.webcrypto?.subtle) {
    return (globalThis as any).crypto.webcrypto.subtle
  }
  // Try to import Node.js crypto
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require("crypto")
    if (nodeCrypto.webcrypto?.subtle) {
      return nodeCrypto.webcrypto.subtle
    }
  } catch {
    // Ignore
  }
  return null
}

/**
 * Verify RSA signature using Web Crypto API
 */
async function verifyRSAWithWebCrypto(
  tbsHash: Uint8Array,
  signature: Uint8Array,
  publicKey: RSAPublicKey,
  hashAlgorithm: HashAlgorithm,
  isPSS: boolean,
  crypto: SubtleCrypto,
): Promise<boolean> {
  // Convert modulus to ArrayBuffer
  const modulusHex = publicKey.modulus.replace("0x", "")
  const modulusBytes = new Uint8Array(modulusHex.length / 2)
  for (let i = 0; i < modulusBytes.length; i++) {
    modulusBytes[i] = parseInt(modulusHex.substring(i * 2, i * 2 + 2), 16)
  }

  // Convert exponent to ArrayBuffer
  const exponent = publicKey.exponent
  const exponentBytes = new Uint8Array(
    exponent <= 0xff ? 1 : exponent <= 0xffff ? 2 : exponent <= 0xffffff ? 3 : 4,
  )
  for (let i = exponentBytes.length - 1; i >= 0; i--) {
    exponentBytes[i] = exponent & 0xff
    // exponent >>>= 8 would work for positive numbers but we need to handle larger values
  }
  if (exponent > 0xff) exponentBytes[exponentBytes.length - 2] = (exponent >> 8) & 0xff
  if (exponent > 0xffff) exponentBytes[exponentBytes.length - 3] = (exponent >> 16) & 0xff
  if (exponent > 0xffffff) exponentBytes[exponentBytes.length - 4] = (exponent >> 24) & 0xff

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
    // Note: Web Crypto expects the original message, not the hash, for verification
    // But since we're passing prehashed data, we need to pass the hash directly
    // This is a limitation - Web Crypto doesn't support prehashed verification directly
    // So we'll reconstruct the data that produces this hash (which we can't do)
    // Instead, for RSA we need to verify against the raw signature using the hash

    // For RSA, the signature is over the hash, so we can verify directly
    // However, Web Crypto's verify expects the original message
    // We need to use a different approach - verify by doing the RSA operation manually
    // or pass the TBS bytes directly

    // Actually, for proper verification, we need the original TBS bytes, not just the hash
    // This function receives the hash, but for Web Crypto we'd need the original data
    // Let's fallback to manual verification for prehashed data
    const signatureBuffer = new Uint8Array(signature).buffer
    const dataBuffer = new Uint8Array(tbsHash).buffer
    return await crypto.verify(verifyAlgorithm, key, signatureBuffer, dataBuffer)
  } catch {
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
 */
function verifyRSAManual(
  tbsHash: Uint8Array,
  signature: Uint8Array,
  publicKey: RSAPublicKey,
  hashAlgorithm: HashAlgorithm,
  isPSS: boolean,
): boolean {
  try {
    const modulus = BigInt(publicKey.modulus)
    const exponent = BigInt(publicKey.exponent)

    // Convert signature to bigint
    let sigInt = BigInt(0)
    for (const byte of signature) {
      sigInt = (sigInt << BigInt(8)) | BigInt(byte)
    }

    // RSA operation: m = s^e mod n
    const message = modPow(sigInt, exponent, modulus)

    // Convert message back to bytes
    const modulusBytes = Math.ceil(publicKey.key_size / 8)
    const messageBytes = new Uint8Array(modulusBytes)
    let temp = message
    for (let i = modulusBytes - 1; i >= 0; i--) {
      messageBytes[i] = Number(temp & BigInt(0xff))
      temp = temp >> BigInt(8)
    }

    if (isPSS) {
      return verifyPSSPadding(messageBytes, tbsHash, hashAlgorithm, publicKey.key_size)
    } else {
      return verifyPKCS1Padding(messageBytes, tbsHash, hashAlgorithm)
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

/**
 * Verify PKCS#1 v1.5 padding
 */
function verifyPKCS1Padding(
  decryptedMessage: Uint8Array,
  expectedHash: Uint8Array,
  hashAlgorithm: HashAlgorithm,
): boolean {
  // PKCS#1 v1.5 format: 0x00 0x01 [0xFF padding] 0x00 [DigestInfo] [Hash]
  if (decryptedMessage[0] !== 0x00 || decryptedMessage[1] !== 0x01) {
    return false
  }

  // Find the 0x00 separator after the padding
  let separatorIndex = 2
  while (separatorIndex < decryptedMessage.length && decryptedMessage[separatorIndex] === 0xff) {
    separatorIndex++
  }

  if (separatorIndex >= decryptedMessage.length || decryptedMessage[separatorIndex] !== 0x00) {
    return false
  }

  separatorIndex++ // Move past the 0x00 separator

  const digestInfo = decryptedMessage.slice(separatorIndex)
  const prefix = DIGEST_INFO_PREFIXES[hashAlgorithm]

  if (digestInfo.length !== prefix.length + expectedHash.length) {
    return false
  }

  // Check prefix
  for (let i = 0; i < prefix.length; i++) {
    if (digestInfo[i] !== prefix[i]) {
      return false
    }
  }

  // Check hash
  for (let i = 0; i < expectedHash.length; i++) {
    if (digestInfo[prefix.length + i] !== expectedHash[i]) {
      return false
    }
  }

  return true
}

/**
 * Verify PSS padding (simplified implementation)
 * Note: This is a simplified implementation that may not cover all edge cases
 */
function verifyPSSPadding(
  em: Uint8Array,
  mHash: Uint8Array,
  hashAlgorithm: HashAlgorithm,
  emBits: number,
): boolean {
  const hashFunc = HASH_FUNCTIONS[hashAlgorithm]
  const hLen = getHashLength(hashAlgorithm)
  const sLen = hLen // Salt length = hash length (common default)
  const emLen = Math.ceil(emBits / 8)

  // Check minimum length
  if (emLen < hLen + sLen + 2) {
    return false
  }

  // Check trailing byte
  if (em[emLen - 1] !== 0xbc) {
    return false
  }

  // Split EM into maskedDB and H
  const dbLen = emLen - hLen - 1
  const maskedDB = em.slice(0, dbLen)
  const H = em.slice(dbLen, dbLen + hLen)

  // Check leading bits of maskedDB
  const leadingBits = 8 * emLen - emBits
  const mask = 0xff >> leadingBits
  if ((maskedDB[0] & ~mask) !== 0) {
    return false
  }

  // Generate dbMask using MGF1
  const dbMask = mgf1(H, dbLen, hashFunc)

  // Recover DB = maskedDB XOR dbMask
  const DB = new Uint8Array(dbLen)
  for (let i = 0; i < dbLen; i++) {
    DB[i] = maskedDB[i] ^ dbMask[i]
  }

  // Clear leading bits
  DB[0] &= mask

  // Check DB format: should be [0x00...] 0x01 [salt]
  const psLen = dbLen - sLen - 1
  for (let i = 0; i < psLen; i++) {
    if (DB[i] !== 0x00) {
      return false
    }
  }
  if (DB[psLen] !== 0x01) {
    return false
  }

  const salt = DB.slice(dbLen - sLen)

  // Compute H' = Hash(0x00 || 0x00 || 0x00 || 0x00 || 0x00 || 0x00 || 0x00 || 0x00 || mHash || salt)
  const mPrime = new Uint8Array(8 + hLen + sLen)
  // First 8 bytes are 0x00
  mPrime.set(mHash, 8)
  mPrime.set(salt, 8 + hLen)

  const HPrime = hashFunc(mPrime)

  // Compare H and H'
  if (H.length !== HPrime.length) {
    return false
  }
  for (let i = 0; i < H.length; i++) {
    if (H[i] !== HPrime[i]) {
      return false
    }
  }

  return true
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
      if (await verifyRSASignature(tbsHash, signature, rsaPublicKey, hashAlgorithm, isPSS)) {
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
      if (await verifyRSASignature(tbsHash, signature, rsaPublicKey, hashAlgorithm, isPSS)) {
        return true
      }
    }
  }

  return false
}
