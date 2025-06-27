/**
 * @deprecated This type will be removed in a future version. Use the `HashAlgorithm` type instead.
 * Certificate digest algorithm
 */
export type DigestAlgorithm = "SHA1" | "SHA224" | "SHA256" | "SHA384" | "SHA512"

/**
 * Certificate signature algorithm
 */
// TODO: Consider relocating this
export type SignatureAlgorithm =
  | "sha1-with-rsa-signature"
  | "sha256WithRSAEncryption"
  | "sha384WithRSAEncryption"
  | "sha512WithRSAEncryption"
  | "rsassa-pss"
  | "ecdsa-with-SHA1"
  | "ecdsa-with-SHA256"
  | "ecdsa-with-SHA384"
  | "ecdsa-with-SHA512"

/**
 * Certificate public key type
 */
export type PublicKeyType = "rsaEncryption" | "ecPublicKey"
