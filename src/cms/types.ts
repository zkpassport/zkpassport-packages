/**
 * Certificate digest algorithm
 */
export type DigestAlgorithm = "SHA1" | "SHA224" | "SHA256" | "SHA384" | "SHA512"

/**
 * Certificate signature algorithm
 */
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
