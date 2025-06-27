// Type declaration for the crypto module
declare let crypto:
  | {
      generateKeyPairSync: (typeof import("crypto"))["generateKeyPairSync"]
      createSign: (typeof import("crypto"))["createSign"]
      createVerify: (typeof import("crypto"))["createVerify"]
    }
  | undefined

// Conditionally import crypto in Node.js environment
if (typeof window === "undefined") {
  try {
    const nodeCrypto = require("crypto")
    crypto = nodeCrypto
  } catch {}
}

import { AsnParser } from "@peculiar/asn1-schema"
import { RSAPublicKey } from "@peculiar/asn1-rsa"
import { fromArrayBufferToBigInt } from "./utils"

/**
 * Generates an RSA key pair.
 * @param keySize - The size of the key in bits (default is 2048).
 * @returns An object containing the private and public keys.
 * @throws Error if crypto is not available
 */
export function generateRSAKeyPair(keySize: number = 2048) {
  if (!crypto) {
    throw new Error("Crypto functionality is not available in this environment")
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: keySize, // Key size in bits
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
    },
    publicKeyEncoding: {
      type: "pkcs1",
      format: "der",
    },
  })
  return { privateKey, publicKey: publicKey as Buffer }
}

export function getRSAPublicKeyParams(publicKey: Buffer): {
  modulus: bigint
  exponent: number
} {
  const parsedKey = AsnParser.parse(publicKey, RSAPublicKey)
  return {
    modulus: fromArrayBufferToBigInt(parsedKey.modulus),
    exponent: Number(fromArrayBufferToBigInt(parsedKey.publicExponent)),
  }
}

/**
 * Signs data using the provided private key.
 * @param privateKey - The private key to sign the data.
 * @param data - The data to be signed.
 * @param hashAlgorithm - The hashing algorithm to use (default is 'SHA256').
 * @returns The binary signature as a Buffer.
 * @throws Error if crypto is not available
 */
export function signData(
  privateKey: string | Buffer,
  data: string | Buffer,
  hashAlgorithm: string = "RSA-SHA256",
): Buffer {
  if (!crypto) {
    throw new Error("Crypto functionality is not available in this environment")
  }
  const sign = crypto.createSign(hashAlgorithm)
  sign.update(data)
  const signature = sign.sign(privateKey)
  return signature
}

/**
 * Verifies a signature against the provided data and public key.
 * @param publicKey - The public key to verify the signature.
 * @param data - The original data that was signed.
 * @param signature - The signature to verify.
 * @param hashAlgorithm - The hashing algorithm to use (default is 'SHA256').
 * @returns true if the signature is valid, false otherwise.
 * @throws Error if crypto is not available
 */
export function verifySignature(
  publicKey: string,
  data: string,
  signature: Buffer,
  hashAlgorithm: string = "SHA256",
): boolean {
  if (!crypto) {
    throw new Error("Crypto functionality is not available in this environment")
  }
  const verify = crypto.createVerify(hashAlgorithm)
  verify.update(data)
  verify.end()
  return verify.verify(publicKey, signature)
}
