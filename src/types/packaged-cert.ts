type NISTCurve =
  | { curve: "P-256"; key_size: 256 }
  | { curve: "P-384"; key_size: 384 }
  | { curve: "P-521"; key_size: 521 }

type BrainpoolCurve =
  | { curve: "brainpoolP160r1"; key_size: 160 }
  | { curve: "brainpoolP160t1"; key_size: 160 }
  | { curve: "brainpoolP192r1"; key_size: 192 }
  | { curve: "brainpoolP192t1"; key_size: 192 }
  | { curve: "brainpoolP224r1"; key_size: 224 }
  | { curve: "brainpoolP224t1"; key_size: 224 }
  | { curve: "brainpoolP256r1"; key_size: 256 }
  | { curve: "brainpoolP256t1"; key_size: 256 }
  | { curve: "brainpoolP320r1"; key_size: 320 }
  | { curve: "brainpoolP320t1"; key_size: 320 }
  | { curve: "brainpoolP384r1"; key_size: 384 }
  | { curve: "brainpoolP384t1"; key_size: 384 }
  | { curve: "brainpoolP512r1"; key_size: 512 }
  | { curve: "brainpoolP512t1"; key_size: 512 }

export type ECCurve = NISTCurve | BrainpoolCurve

export type ECPublicKey = ECCurve & {
  type: "EC"
  public_key_x: string
  public_key_y: string
}

export type RSAPublicKey = {
  type: "RSA"
  key_size: number
  modulus: string
  exponent: number
}

export type HashAlgorithm = "SHA-1" | "SHA-224" | "SHA-256" | "SHA-384" | "SHA-512"

export type NISTCurveName = "P-256" | "P-384" | "P-521"

export type BrainpoolCurveName =
  | "brainpoolP160r1"
  | "brainpoolP160t1"
  | "brainpoolP192r1"
  | "brainpoolP192t1"
  | "brainpoolP224r1"
  | "brainpoolP224t1"
  | "brainpoolP256r1"
  | "brainpoolP256t1"
  | "brainpoolP320r1"
  | "brainpoolP320t1"
  | "brainpoolP384r1"
  | "brainpoolP384t1"
  | "brainpoolP512r1"
  | "brainpoolP512t1"

export type CurveName = NISTCurveName | BrainpoolCurveName

export type SignatureAlgorithmType = "RSA" | "RSA-PSS" | "ECDSA"

export type PackagedCertificate = {
  country: string
  signature_algorithm: SignatureAlgorithmType
  hash_algorithm: HashAlgorithm
  public_key: ECPublicKey | RSAPublicKey
  validity: {
    not_before: number
    not_after: number
  }
  private_key_usage_period?: {
    not_before?: number
    not_after?: number
  }
  subject_key_identifier?: string
  authority_key_identifier?: string
  tags?: string[]
  type?: string
}
