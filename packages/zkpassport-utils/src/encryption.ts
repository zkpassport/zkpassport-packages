import { gcm } from "@noble/ciphers/aes"
import { utf8ToBytes } from "@noble/ciphers/utils"
import * as secp256k1 from "@noble/secp256k1"
import { sha256 } from "@noble/hashes/sha256"

async function sha256Truncate(topic: string): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const data = encoder.encode(topic)
  const hashBuffer = await sha256(data)
  const fullHashArray = new Uint8Array(hashBuffer)
  const truncatedHashArray = fullHashArray.slice(0, 12)
  return truncatedHashArray
}

export async function generateECDHKeyPair() {
  const privKey = secp256k1.utils.randomPrivateKey()
  const pubKey = secp256k1.getPublicKey(privKey)
  return {
    privateKey: privKey,
    publicKey: pubKey,
  }
}

export async function getSharedSecret(privateKey: string, publicKey: string) {
  const sharedSecret = secp256k1.getSharedSecret(privateKey, publicKey)
  return sharedSecret.slice(0, 32)
}

export async function encrypt(message: string, sharedSecret: Uint8Array, topic: string) {
  // Nonce must be 12 bytes
  const nonce = await sha256Truncate(topic)
  const aes = gcm(sharedSecret, nonce)
  const data = utf8ToBytes(message)
  const ciphertext = aes.encrypt(data)
  return ciphertext
}

export async function decrypt(ciphertext: Uint8Array, sharedSecret: Uint8Array, topic: string) {
  // Nonce must be 12 bytes
  const nonce = await sha256Truncate(topic)
  const aes = gcm(sharedSecret, nonce)
  const data = aes.decrypt(ciphertext)
  const dataString = String.fromCharCode.apply(null, Array.from(data))
  return dataString
}

export async function decryptBuffer(
  ciphertext: Uint8Array,
  sharedSecret: Uint8Array,
  topic: string,
) {
  const nonce = await sha256Truncate(topic)
  const aes = gcm(sharedSecret, nonce)
  const data = aes.decrypt(ciphertext)
  return data
}
