/* eslint-disable @typescript-eslint/no-explicit-any */

import { sha256 } from "@noble/hashes/sha2.js"
import { AsnParser } from "@peculiar/asn1-schema"
import { AuthorityKeyIdentifier } from "@peculiar/asn1-x509"
import { Alpha3Code } from "i18n-iso-countries"
import { redcLimbsFromBytes } from "./barrett-reduction"
import { Binary, HexString } from "./binary"
import {
  BoundDataIdentifier,
  calculatePrivateNullifier,
  formatBoundData,
  getCountryFromWeightedSum,
  getCountryWeightedSum,
  hashSaltCountrySignedAttrDg1EContentPrivateNullifier,
  hashSaltCountryTbs,
  hashSaltDg1Dg2HashPrivateNullifier,
  normalizeDg2Hash,
  SECONDS_BETWEEN_1900_AND_1970,
} from "./circuits"
import { DisclosedData, getDisclosedBytesFromMrzAndMask, parseDate } from "./circuits/disclose"
import type { DigestAlgorithm } from "./cms/types"
import {
  getBitSizeFromCurve,
  getCurveParams,
  getECDSAInfo,
  getRSAInfo,
  getRSAPSSParams,
} from "./cms/utils"
import { DG1_INPUT_SIZE, E_CONTENT_INPUT_SIZE, SIGNED_ATTR_INPUT_SIZE } from "./constants"
import { countryCodeAlpha2ToAlpha3 } from "./country/country"
import { computeMerkleProof } from "./merkle-tree"
import {
  extractTBS,
  getDSCSignatureHashAlgorithm,
  getSodSignatureAlgorithmType,
} from "./passport/passport-reader"
import {
  buildMerkleTreeFromMasterlists,
  buildMerkleTreeFromRevocations,
  CERT_TYPE_CSCA,
  CERTIFICATE_MERKLE_TREE_HEIGHT,
  getCertificateLeafHash,
  getCertificateLeafHashes,
  tagsArrayToBitsFlag,
} from "./registry"
import type {
  BoundData,
  CommittedInputs,
  DisclosureCircuitName,
  DisclosureWitness,
  HashAlgorithm,
  IntegrityToDisclosureSalts,
  PackagedCertificate,
  PackagedCertificatesFile,
} from "./types"
import {
  ECDSADSCDataInputs,
  IDCredential,
  IDDataInputs,
  PassportViewModel,
  Query,
  RSADSCDataInputs,
  SaltedValue,
} from "./types"
import {
  bigintToBytes,
  bigintToNumber,
  fromBytesToBigInt,
  getBitSize,
  getChainFromId,
  getHashAlgorithmIdentifierFromLength,
  getHashAlgorithmLength,
  getUnixTimestamp,
  leftPadArrayWithZeros,
  mrzFromDg1,
  rightPadArrayWithZeros,
} from "./utils"
import { DSC } from "./passport/dsc"
import {
  getBirthdateRange,
  getDocumentNumberRange,
  getExpiryDateRange,
  getFirstNameRange,
  getFullNameRange,
  getGenderRange,
  getLastNameRange,
  getNationalityRange,
} from "./passport/getters"
import { type OPRFProof, OPRF_ZERO_PROOF } from "./oprf"
import { SanctionsBuilder } from "./circuits/sanctions"
export { SanctionsBuilder }

// @deprecated This list will be removed in a future version
const SUPPORTED_HASH_ALGORITHMS: DigestAlgorithm[] = ["SHA1", "SHA256", "SHA384", "SHA512"]

// TODO: Improve this with a structured list of supported signature algorithms
export function isSignatureAlgorithmSupported(
  passport: PassportViewModel,
  signatureAlgorithm: "RSA" | "ECDSA" | "",
): boolean {
  const tbsCertificate = extractTBS(passport)
  if (!tbsCertificate) {
    return false
  }
  if (signatureAlgorithm === "ECDSA") {
    try {
      const ecdsaInfo = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
      return !!ecdsaInfo.curve
    } catch {
      return false
    }
  } else if (signatureAlgorithm === "RSA") {
    const rsaInfo = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
    const modulusBits = getBitSize(rsaInfo.modulus)
    return (
      (modulusBits === 1024 ||
        modulusBits === 2048 ||
        modulusBits === 3072 ||
        modulusBits === 4096) &&
      rsaInfo.exponent < 131072n
    )
  }
  return false
}

/**
 * Check if a CSCA is supported by our circuits, based on the signature algorithm and hash algorithm
 * @param csca The CSCA packaged certificate to check
 * @returns True if the CSCA is supported, false otherwise
 */
export function isCscaSupported(csca: PackagedCertificate): boolean {
  if (csca.signature_algorithm == "RSA") {
    return (
      (csca.public_key.key_size === 1024 ||
        csca.public_key.key_size === 2048 ||
        csca.public_key.key_size === 3072 ||
        csca.public_key.key_size === 4096) &&
      csca.public_key.exponent < 131072
    )
  } else if (csca.signature_algorithm == "RSA-PSS" || csca.signature_algorithm == "ECDSA") {
    return true
  }
  return false
}

export function isDSCSupported(dsc: DSC): boolean {
  const hashAlgorithm = getDSCSignatureHashAlgorithm(dsc)
  return !!hashAlgorithm && SUPPORTED_HASH_ALGORITHMS.includes(hashAlgorithm)
}

export function isIDSupported(passport: PassportViewModel): boolean {
  const sodSignatureAlgorithm = getSodSignatureAlgorithmType(passport)
  return (
    isSignatureAlgorithmSupported(passport, sodSignatureAlgorithm) &&
    passport.sod.digestAlgorithms.every((digest) => SUPPORTED_HASH_ALGORITHMS.includes(digest)) &&
    SUPPORTED_HASH_ALGORITHMS.includes(passport.sod.encapContentInfo.eContent.hashAlgorithm) &&
    SUPPORTED_HASH_ALGORITHMS.includes(passport.sod.signerInfo.digestAlgorithm)
  )
}

export function getTBSMaxLen(passport: PassportViewModel): number {
  const tbs_len = passport.sod.certificate.tbs.bytes.length
  if (tbs_len <= 700) {
    return 700
  } else if (tbs_len <= 1000) {
    return 1000
  } else if (tbs_len <= 1200) {
    return 1200
  } else {
    return 1600
  }
}

/**
 * @deprecated Use getCscaForPassportAsync instead for more reliable certificate matching.
 * This synchronous version uses only AKI/SKI matching without signature verification.
 */
export function getCscaForPassport(
  dsc: DSC,
  certificates: PackagedCertificate[],
): PackagedCertificate | null {
  const { akiMatchedCert } = getCscaCandidates(dsc, certificates)
  return akiMatchedCert
}

/**
 * Find CSC candidates for a DSC using AKI/SKI matching
 * Returns both the best AKI match and all certificates from the same country
 */
function getCscaCandidates(
  dsc: DSC,
  certificates: PackagedCertificate[],
  skipAKIMatching: boolean = false,
): {
  akiMatchedCert: PackagedCertificate | null
  countryCerts: PackagedCertificate[]
  formattedCountry: string
} {
  const extensions = dsc.tbs.extensions

  let authorityKeyIdentifier: string | undefined
  const akiBuffer = extensions.get("authorityKeyIdentifier")?.value.toBuffer()
  if (akiBuffer) {
    const parsed = AsnParser.parse(akiBuffer, AuthorityKeyIdentifier)
    if (parsed?.keyIdentifier?.buffer) {
      authorityKeyIdentifier = Binary.from(parsed.keyIdentifier.buffer).toHex().replace("0x", "")
    }
  }
  const country = getDSCCountry(dsc)
  const formattedCountry = country === "D<<" ? "DEU" : country

  const checkAgainstAuthorityKeyIdentifier = (cert: PackagedCertificate) => {
    return (
      authorityKeyIdentifier &&
      cert.subject_key_identifier?.replace("0x", "") === authorityKeyIdentifier
    )
  }

  // Get all certificates from the same country
  const countryCerts = certificates.filter((cert) => {
    return cert.country.toLowerCase() === formattedCountry.toLowerCase()
  })

  // First try to find the CSC by looking at the authority key identifier
  // which should uniquely identify the CSC that signed the DSC
  const validCertificates = skipAKIMatching
    ? []
    : countryCerts.filter(checkAgainstAuthorityKeyIdentifier)

  let akiMatchedCert: PackagedCertificate | null = null

  if (validCertificates.length === 1) {
    akiMatchedCert = validCertificates[0]
  } else if (validCertificates.length > 1) {
    // // Support edge cases where multiple CSCs with the same characteristics are found
    // const checkSignatureAlgorithm = (cert: PackagedCertificate) => {
    //   if (cert.signature_algorithm === "RSA-PSS") {
    //     return dsc.signatureAlgorithm.name.toLowerCase().includes("pss")
    //   } else if (cert.signature_algorithm === "RSA") {
    //     return dsc.signatureAlgorithm.name.toLowerCase().includes("rsa")
    //   } else if (cert.signature_algorithm === "ECDSA") {
    //     return dsc.signatureAlgorithm.name.toLowerCase().includes("ecdsa")
    //   }
    //   return false
    // }
    // akiMatchedCert =
    //   validCertificates.find((cert) => {
    //     return (
    //       cert.hash_algorithm.replace("-", "").toLowerCase() ===
    //         getDSCSignatureHashAlgorithm(dsc)?.toLowerCase() && checkSignatureAlgorithm(cert)
    //     )
    //   }) ?? validCertificates[0]
  }

  return { akiMatchedCert, countryCerts, formattedCountry }
}

/**
 * Find the CSC (Country Signing Certificate) that signed the given DSC (Document Signer Certificate).
 *
 * This function uses a three-tier fallback mechanism:
 * 1. AKI/SKI matching: First tries to match the DSC's Authority Key Identifier with
 *    a CSC's Subject Key Identifier, then verifies the signature.
 * 2. Country-wide search: If AKI/SKI match fails signature verification, searches all
 *    CSCs from the same country and verifies signatures.
 * 3. Fallback: If all signature verifications fail, returns the original AKI/SKI match
 *    (which may still be correct despite verification failure due to algorithm mismatches).
 *
 * @param dsc - The Document Signer Certificate to find the parent CSC for
 * @param certificates - Array of all available CSC certificates
 * @param skipAKIMatching - Whether to skip AKI/SKI matching and only use country-wide search
 * @returns The matching CSC certificate, or null if none found
 */
export async function getCscaForPassportAsync(
  dsc: DSC,
  certificates: PackagedCertificate[],
  skipAKIMatching: boolean = false,
): Promise<PackagedCertificate | null> {
  const { verifyDscSignature } = await import("./signature-verification")

  const { akiMatchedCert, countryCerts } = getCscaCandidates(dsc, certificates, skipAKIMatching)

  // Step 1: If we found a certificate via AKI/SKI matching, verify the signature
  if (akiMatchedCert) {
    try {
      const isValid = await verifyDscSignature(dsc, akiMatchedCert)
      if (isValid) {
        return akiMatchedCert
      }
    } catch {
      // Signature verification failed, continue to fallback
    }
  }

  // Step 2: If AKI/SKI match failed or no match found, try all certificates from the same country
  // This handles cases where the AKI/SKI might be wrong or missing
  for (const cert of countryCerts) {
    // Skip the one we already tried
    if (cert === akiMatchedCert) continue

    try {
      const isValid = await verifyDscSignature(dsc, cert)
      if (isValid) {
        return cert
      }
    } catch {
      // Continue to next certificate
    }
  }

  // Step 3: If all signature verifications failed, return the original AKI/SKI match
  // This is a fallback for edge cases where:
  // - The signature algorithm parameters might be incorrectly declared
  // - Our verification implementation might not support some edge cases
  // - The certificate data might be malformed but still valid
  return akiMatchedCert
}

function getDSCDataInputs(
  passport: PassportViewModel,
  maxTbsLength: number,
): ECDSADSCDataInputs | RSADSCDataInputs | null {
  const signatureAlgorithm = getSodSignatureAlgorithmType(passport)
  const tbsCertificate = extractTBS(passport)
  if (!tbsCertificate) {
    return null
  }
  if (signatureAlgorithm === "ECDSA") {
    const ecdsaInfo = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
    // The first byte is 0x04, which is the ASN.1 sequence tag for a SEQUENCE of two integers
    // So we skip the first byte
    const dscPubkeyX = Array.from(
      ecdsaInfo.publicKey.slice(1, (ecdsaInfo.publicKey.length - 1) / 2 + 1),
    )
    const dscPubkeyY = Array.from(
      ecdsaInfo.publicKey.slice((ecdsaInfo.publicKey.length - 1) / 2 + 1),
    )
    return {
      tbs_certificate: rightPadArrayWithZeros(
        passport?.sod.certificate.tbs.bytes.toNumberArray() ?? [],
        maxTbsLength,
      ),
      dsc_pubkey_x: dscPubkeyX,
      dsc_pubkey_y: dscPubkeyY,
    }
  } else {
    const { modulus, exponent } = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
    const modulusBits = getBitSize(modulus)
    const modulusBytes = leftPadArrayWithZeros(bigintToBytes(modulus), Math.ceil(modulusBits / 8))
    return {
      dsc_pubkey: modulusBytes,
      exponent: bigintToNumber(exponent),
      dsc_pubkey_redc_param: leftPadArrayWithZeros(
        redcLimbsFromBytes(modulusBytes),
        Math.ceil(modulusBits / 8) + 1,
      ),
      tbs_certificate: rightPadArrayWithZeros(
        passport?.sod.certificate.tbs.bytes.toNumberArray() ?? [],
        maxTbsLength,
      ),
    }
  }
}

async function getIDDataInputs(passport: PassportViewModel): Promise<IDDataInputs> {
  const dg1 = passport?.dataGroups.find((dg) => dg.groupNumber === 1)
  const dg2 = passport?.dataGroups.find((dg) => dg.groupNumber === 2)
  const eContent = passport?.sod.encapContentInfo.eContent.bytes.toNumberArray()
  const signedAttributes = passport.sod.signerInfo.signedAttrs.bytes.toNumberArray()
  const id_data = {
    // Padded with 0s to make it 700 bytes
    e_content: rightPadArrayWithZeros(eContent ?? [], E_CONTENT_INPUT_SIZE),
    // Padded to 200 bytes with 0s
    signed_attributes: rightPadArrayWithZeros(signedAttributes ?? [], SIGNED_ATTR_INPUT_SIZE),
    // Padded to 95 bytes with 0s
    dg1: rightPadArrayWithZeros(dg1?.value ?? [], DG1_INPUT_SIZE),
    dg2_hash_normalized: await normalizeDg2Hash(dg2?.hash ?? []),
    dg2_hash_type: getHashAlgorithmIdentifierFromLength(dg2?.hash.length ?? 0),
  }
  return id_data
}

function ensureLowSValue(
  s: number[],
  curveParams: { a: bigint; b: bigint; n: bigint; p: bigint },
): number[] {
  const sBigInt = fromBytesToBigInt(s)
  const halfN = curveParams.n / 2n
  if (sBigInt > halfN) {
    const lowS = curveParams.n - sBigInt
    return bigintToBytes(lowS)
  }
  return s
}

export function processECDSASignature(
  signature: number[],
  byteSize: number,
  curveParams: { a: bigint; b: bigint; n: bigint; p: bigint },
): number[] {
  if (signature.length === byteSize * 2) {
    const r = signature.slice(0, byteSize)
    const s = ensureLowSValue(signature.slice(byteSize), curveParams)
    return [...leftPadArrayWithZeros(r, byteSize), ...leftPadArrayWithZeros(s, byteSize)]
  }

  if (signature[0] !== 0x30) {
    // Not a valid ASN.1 sequence
    return signature
  }
  const innerLengthIndex = signature[1] == signature.length - 2 ? 1 : 2
  // This is the length of the inner sequence
  const innerLength = signature[innerLengthIndex]
  if (
    signature[innerLengthIndex + 1] !== 0x02 ||
    innerLength !== signature.length - innerLengthIndex - 1
  ) {
    // Not a valid ASN.1 sequence
    return signature
  }
  const rLength = signature[innerLengthIndex + 2]
  let r = signature.slice(innerLengthIndex + 3, innerLengthIndex + 3 + rLength)

  if (signature[innerLengthIndex + 3 + rLength] !== 0x02) {
    // Not a valid ASN.1 sequence
    return signature
  }
  const sLength = signature[innerLengthIndex + 3 + rLength + 1]
  let s = signature.slice(
    innerLengthIndex + 3 + rLength + 2,
    innerLengthIndex + 3 + rLength + 2 + sLength,
  )

  // Remove leading 0s
  for (let i = 0; i < r.length; i++) {
    if (r[i] !== 0x00) {
      r = r.slice(i)
      break
    }
  }
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== 0x00) {
      s = s.slice(i)
      break
    }
  }

  // Ensure s is the low-s value (canonical form)
  s = ensureLowSValue(s, curveParams)

  // Pad r and s to the expected byte size
  r = leftPadArrayWithZeros(r, byteSize)
  s = leftPadArrayWithZeros(s, byteSize)
  return [...r, ...s]
}

export function getScopeHash(value?: string): bigint {
  if (!value) {
    return 0n
  }
  // Hash the value using SHA256 and truncate to 31 bytes (248 bits)
  const sha2Hash = sha256(new TextEncoder().encode(value)).slice(0, 31)
  // Convert the hash to a bigint
  const bytes = fromBytesToBigInt(Array.from(sha2Hash))
  return bytes
}

export function getServiceScopeHash(domain: string) {
  return getScopeHash(domain)
}

export function getServiceSubscopeHash(value: string) {
  return getScopeHash(value)
}

export function processSodSignature(signature: number[], passport: PassportViewModel): number[] {
  const signatureAlgorithm = getSodSignatureAlgorithmType(passport)
  if (signatureAlgorithm === "ECDSA") {
    const tbsCertificate = extractTBS(passport)
    if (!tbsCertificate) return []
    const ecdsaInfo = getECDSAInfo(tbsCertificate.subjectPublicKeyInfo)
    const curve = ecdsaInfo.curve
    const bitSize = getBitSizeFromCurve(curve)
    return processECDSASignature(signature, Math.ceil(bitSize / 8), getCurveParams(curve))
  } else {
    return signature
  }
}

export function getDSCSignatureAlgorithmHashAlgorithm(passport: PassportViewModel): string {
  const signatureAlgorithm = passport.sod.certificate.signatureAlgorithm.name.toLowerCase()
  if (signatureAlgorithm.includes("sha1")) {
    return "sha1"
  } else if (signatureAlgorithm.includes("sha224")) {
    return "sha224"
  } else if (signatureAlgorithm.includes("sha256")) {
    return "sha256"
  } else if (signatureAlgorithm.includes("sha384")) {
    return "sha384"
  } else if (signatureAlgorithm.includes("sha512")) {
    return "sha512"
  } else {
    return "sha256"
  }
}

export async function getDSCCircuitInputs(
  passport: PassportViewModel,
  salt: bigint,
  packagedCerts: PackagedCertificatesFile,
  overrideCertLeaves?: bigint[],
  overrideMerkleProof?: {
    root: string | HexString
    index: number
    path: (string | HexString)[]
  },
) {
  if (packagedCerts.version !== 1) {
    throw new Error(
      `getDSCCircuitInputs requires v1 packaged certificates (got version ${packagedCerts.version ?? 0})`,
    )
  }
  const schemaVersion = packagedCerts.version
  // Get the CSCA for this passport's DSC using the async version with signature verification fallback
  const csca = await getCscaForPassportAsync(passport.sod.certificate, packagedCerts.certificates)
  if (!csca) throw new Error("Could not find CSCA for DSC")
  // Generate the certificate tree merkle proof
  const cscaLeaf = await getCertificateLeafHash(csca, { version: schemaVersion })
  const leaves =
    overrideCertLeaves ??
    (await getCertificateLeafHashes(packagedCerts.certificates, schemaVersion))
  const index = leaves.findIndex((leaf) => leaf === cscaLeaf)
  const tags = tagsArrayToBitsFlag(csca.tags ?? [])
  const merkleProof =
    overrideMerkleProof ?? (await computeMerkleProof(leaves, index, CERTIFICATE_MERKLE_TREE_HEIGHT))

  const revocationTree = await buildMerkleTreeFromRevocations(packagedCerts.revocations ?? [])
  const masterlistTree = await buildMerkleTreeFromMasterlists(packagedCerts.masterlists ?? [])

  const inputs = {
    certificate_registry_root: packagedCerts.root,
    schema_version: schemaVersion,
    timestamp: packagedCerts.timestamp,
    certificate_tree_index: merkleProof.index,
    certificate_tree_hash_path: merkleProof.path,
    certificate_tags: tags.map((tag) => `0x${tag.toString(16)}`),
    certificate_type: `0x${CERT_TYPE_CSCA.toString(16)}`,
    country: csca.country,
    csc_expiry: csca.validity.not_after,
    csc_fingerprint: csca.fingerprint!,
    revocation_tree_root: revocationTree.root,
    masterlist_tree_root: masterlistTree.root,
    salt: `0x${salt.toString(16)}`,
  }

  const maxTbsLength = getTBSMaxLen(passport)
  if (csca.public_key.type === "EC") {
    const publicKeyXBytes = Buffer.from(csca.public_key.public_key_x.replace("0x", ""), "hex")
    const publicKeyYBytes = Buffer.from(csca.public_key.public_key_y.replace("0x", ""), "hex")
    const curve = csca.public_key.curve
    const bitSize = getBitSizeFromCurve(curve)
    const dscSignature = processECDSASignature(
      passport?.sod.certificate.signature.toNumberArray() ?? [],
      Math.ceil(bitSize / 8),
      getCurveParams(curve),
    )
    return {
      ...inputs,
      csc_pubkey_x: Array.from(publicKeyXBytes),
      csc_pubkey_y: Array.from(publicKeyYBytes),
      dsc_signature: dscSignature,
      tbs_certificate: rightPadArrayWithZeros(
        passport?.sod.certificate.tbs.bytes.toNumberArray() ?? [],
        maxTbsLength,
      ),
    }
  } else if (csca.public_key.type === "RSA") {
    const modulusBits = getBitSize(BigInt(csca.public_key.modulus))
    const modulusBytes = leftPadArrayWithZeros(
      bigintToBytes(BigInt(csca.public_key.modulus)),
      Math.ceil(modulusBits / 8),
    )
    const saltLength = (() => {
      if (csca.signature_algorithm === "RSA-PSS") {
        const hashAlgorithm = getDSCSignatureAlgorithmHashAlgorithm(passport)
          .toUpperCase()
          .replace("SHA", "SHA-") as HashAlgorithm
        const fallBackSaltLength = hashAlgorithm ? getHashAlgorithmLength(hashAlgorithm) : 32
        const rsaPssParams = passport.sod.certificate.signatureAlgorithm.parameters
          ? getRSAPSSParams(
              passport.sod.certificate.signatureAlgorithm.parameters?.toBuffer() as BufferSource,
            )
          : null
        return rsaPssParams?.saltLength ?? fallBackSaltLength
      }
      return 0
    })()
    return {
      ...inputs,
      tbs_certificate: rightPadArrayWithZeros(
        passport?.sod.certificate.tbs.bytes.toNumberArray() ?? [],
        maxTbsLength,
      ),
      dsc_signature: passport?.sod.certificate.signature.toNumberArray() ?? [],
      csc_pubkey: modulusBytes,
      csc_pubkey_redc_param: leftPadArrayWithZeros(
        redcLimbsFromBytes(modulusBytes),
        Math.ceil(modulusBits / 8) + 1,
      ),
      exponent: csca.public_key.exponent,
      pss_salt_len: saltLength,
    }
  }
}

export function getSodSignatureAlgorithmHashAlgorithm(passport: PassportViewModel): string {
  const signatureAlgorithm = passport.sod.signerInfo.signatureAlgorithm.name.toLowerCase()
  const saHashAlgorithm = passport.sod.signerInfo.digestAlgorithm.toLowerCase().replace("-", "")
  if (signatureAlgorithm.includes("sha1")) {
    return "sha1"
  } else if (signatureAlgorithm.includes("sha224")) {
    return "sha224"
  } else if (signatureAlgorithm.includes("sha256")) {
    return "sha256"
  } else if (signatureAlgorithm.includes("sha384")) {
    return "sha384"
  } else if (signatureAlgorithm.includes("sha512")) {
    return "sha512"
  } else {
    return saHashAlgorithm
  }
}

export async function getIDDataCircuitInputs(
  passport: PassportViewModel,
  saltIn: bigint,
  saltOut: bigint,
) {
  const idData = await getIDDataInputs(passport)
  const maxTbsLength = getTBSMaxLen(passport)
  const dscData = getDSCDataInputs(passport, maxTbsLength)
  if (!dscData || !idData) return null

  const commIn = await hashSaltCountryTbs(
    saltIn,
    getDSCCountry(passport.sod.certificate),
    passport.sod.certificate.tbs.bytes,
    maxTbsLength,
  )

  const inputs = {
    dg1: idData.dg1,
    signed_attributes: idData.signed_attributes,
    comm_in: commIn.toHex(),
    salt_in: `0x${saltIn.toString(16)}`,
    salt_out: `0x${saltOut.toString(16)}`,
    e_content: idData.e_content,
  }

  const signatureAlgorithm = getSodSignatureAlgorithmType(passport)
  if (signatureAlgorithm === "ECDSA") {
    return {
      ...inputs,
      tbs_certificate: dscData.tbs_certificate,
      dsc_pubkey_x: (dscData as ECDSADSCDataInputs).dsc_pubkey_x,
      dsc_pubkey_y: (dscData as ECDSADSCDataInputs).dsc_pubkey_y,
      sod_signature: processSodSignature(
        passport?.sod.signerInfo.signature.toNumberArray() ?? [],
        passport,
      ),
      signed_attributes: idData.signed_attributes,
    }
  } else if (signatureAlgorithm === "RSA") {
    const pubkeySize = (dscData as RSADSCDataInputs).dsc_pubkey.length
    const saltLength = (() => {
      if (passport.sod.signerInfo.signatureAlgorithm.name.toLowerCase().includes("pss")) {
        const hashAlgorithm = getSodSignatureAlgorithmHashAlgorithm(passport)
          .toUpperCase()
          .replace("SHA", "SHA-") as HashAlgorithm
        const rsaPssParams = passport.sod.signerInfo.signatureAlgorithm.parameters
          ? getRSAPSSParams(
              passport.sod.signerInfo.signatureAlgorithm.parameters?.toBuffer() as BufferSource,
            )
          : null
        return rsaPssParams?.saltLength ?? getHashAlgorithmLength(hashAlgorithm)
      }
      return 0
    })()
    return {
      ...inputs,
      dsc_pubkey: (dscData as RSADSCDataInputs).dsc_pubkey,
      exponent: (dscData as RSADSCDataInputs).exponent,
      sod_signature: leftPadArrayWithZeros(
        passport?.sod.signerInfo.signature.toNumberArray() ?? [],
        pubkeySize,
      ),
      dsc_pubkey_redc_param: (dscData as RSADSCDataInputs).dsc_pubkey_redc_param,
      tbs_certificate: (dscData as RSADSCDataInputs).tbs_certificate,
      signed_attributes: idData.signed_attributes,
      pss_salt_len: saltLength,
    }
  }
}

export function getDSCCountry(dsc: DSC): string {
  const country = dsc.tbs.issuer?.match(/countryName=([A-Za-z]+)/)?.[1]
  const formattedCountryCode = country?.length === 2 ? countryCodeAlpha2ToAlpha3(country) : country
  return formattedCountryCode ?? dsc.tbs.subject.match(/countryName=([A-Za-z]+)/)?.[1] ?? ""
}

export async function getIntegrityCheckCircuitInputs(
  passport: PassportViewModel,
  saltIn: bigint,
  saltsOut: IntegrityToDisclosureSalts,
) {
  const maxTbsLength = getTBSMaxLen(passport)
  const dscData = getDSCDataInputs(passport, maxTbsLength)
  if (!dscData) return null
  const idData = await getIDDataInputs(passport)
  if (!idData) return null

  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(idData.e_content).padEnd(E_CONTENT_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const signedAttributes = passport?.sod.signerInfo.signedAttrs.bytes.toNumberArray()
  const comm_in = await hashSaltCountrySignedAttrDg1EContentPrivateNullifier(
    saltIn,
    getDSCCountry(passport.sod.certificate),
    Binary.from(signedAttributes).padEnd(SIGNED_ATTR_INPUT_SIZE),
    BigInt(signedAttributes.length),
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(idData.e_content).padEnd(E_CONTENT_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  const saltedDg1 = SaltedValue.fromValue(saltsOut.dg1Salt, idData.dg1)
  const saltedPrivateNullifier = SaltedValue.fromValue(
    saltsOut.privateNullifierSalt,
    privateNullifier.toBigInt(),
  )

  return {
    salted_dg1: saltedDg1.formatForInput(),
    salted_private_nullifier: saltedPrivateNullifier.formatForInput(),
    expiry_date_salt: `0x${saltsOut.expiryDateSalt.toString(16)}`,
    dg2_hash_salt: `0x${saltsOut.dg2HashSalt.toString(16)}`,
    signed_attributes: idData.signed_attributes,
    e_content: idData.e_content,
    comm_in: comm_in.toHex(),
    salt_in: `0x${saltIn.toString(16)}`,
  }
}

/**
 * The minimal identity data every disclosure circuit's inputs derive from.
 * Constructed either from a full PassportViewModel (mobile flow) or from a
 * stored DisclosureWitness (browser enrollment flow).
 */
export type DisclosureIdentityData = {
  mrz: string
  // 6-character MRZ date of birth
  dateOfBirth: string
  // 6-character MRZ expiry date
  passportExpiry: string
  // DG1 bytes padded to DG1_INPUT_SIZE (95)
  dg1: number[]
  dg2HashNormalized: bigint
  dg2HashType: number
  privateNullifier: Binary
}

export async function getDisclosureIdentityFromPassport(
  passport: PassportViewModel,
): Promise<DisclosureIdentityData | null> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(idData.e_content).padEnd(E_CONTENT_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  return {
    mrz: passport.mrz,
    dateOfBirth: passport.dateOfBirth,
    passportExpiry: passport.passportExpiry,
    dg1: idData.dg1,
    dg2HashNormalized: idData.dg2_hash_normalized,
    dg2HashType: idData.dg2_hash_type,
    privateNullifier,
  }
}

export async function getDisclosureIdentityFromWitness(
  witness: DisclosureWitness,
): Promise<DisclosureIdentityData> {
  const mrz = mrzFromDg1(witness.dg1)
  return {
    mrz,
    dateOfBirth: mrz.slice(...getBirthdateRange({ mrz })),
    passportExpiry: witness.expiryDate,
    dg1: rightPadArrayWithZeros(witness.dg1, DG1_INPUT_SIZE),
    dg2HashNormalized: await normalizeDg2Hash(witness.dg2Hash),
    dg2HashType: getHashAlgorithmIdentifierFromLength(witness.dg2Hash.length),
    privateNullifier: Binary.from(BigInt(witness.privateNullifier)),
  }
}

/**
 * Extract the minimal disclosure witness from a passport, e.g. to build an
 * enrollment bundle. `salt` is the single integrity-to-disclosure salt.
 */
export async function getDisclosureWitness(
  passport: PassportViewModel,
  salt: bigint,
): Promise<DisclosureWitness | null> {
  const dg1 = passport?.dataGroups.find((dg) => dg.groupNumber === 1)
  const dg2 = passport?.dataGroups.find((dg) => dg.groupNumber === 2)
  if (!dg1 || !dg2) return null
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return {
    dg1: dg1.value,
    dg2Hash: dg2.hash,
    expiryDate: passport.passportExpiry,
    privateNullifier: identity.privateNullifier.toHex(),
    salt: `0x${salt.toString(16)}`,
  }
}

async function getDisclosureCoreInputs(
  identity: DisclosureIdentityData,
  salts: IntegrityToDisclosureSalts,
  hideSensitiveInputs: boolean = false,
) {
  const commIn = await hashSaltDg1Dg2HashPrivateNullifier(
    salts,
    Binary.from(identity.dg1).padEnd(DG1_INPUT_SIZE),
    identity.passportExpiry,
    identity.dg2HashNormalized,
    identity.dg2HashType,
    identity.privateNullifier.toBigInt(),
  )
  const saltedValues = await getSaltedValuesForDisclosureCircuitFromIdentity(
    identity,
    salts,
    hideSensitiveInputs,
  )
  return { commIn, saltedValues }
}

export async function getSaltedValuesForDisclosureCircuit(
  passport: PassportViewModel,
  idData: IDDataInputs,
  privateNullifier: Binary,
  salts: IntegrityToDisclosureSalts,
  hideSensitiveInputs: boolean = false,
) {
  return getSaltedValuesForDisclosureCircuitFromIdentity(
    {
      mrz: passport.mrz,
      dateOfBirth: passport.dateOfBirth,
      passportExpiry: passport.passportExpiry,
      dg1: idData.dg1,
      dg2HashNormalized: idData.dg2_hash_normalized,
      dg2HashType: idData.dg2_hash_type,
      privateNullifier,
    },
    salts,
    hideSensitiveInputs,
  )
}

async function getSaltedValuesForDisclosureCircuitFromIdentity(
  identity: DisclosureIdentityData,
  salts: IntegrityToDisclosureSalts,
  hideSensitiveInputs: boolean = false,
) {
  const saltedDg1 = SaltedValue.fromValue(salts.dg1Salt, identity.dg1)
  const saltedPrivateNullifier = SaltedValue.fromValue(
    salts.privateNullifierSalt,
    identity.privateNullifier.toBigInt(),
  )
  const saltedExpiryDate = SaltedValue.fromValue(
    salts.expiryDateSalt,
    identity.passportExpiry.split("").map((char) => char.charCodeAt(0)),
  )
  const saltedDg2Hash = SaltedValue.fromValue(salts.dg2HashSalt, identity.dg2HashNormalized)
  const saltedDg2HashType = SaltedValue.fromValue(salts.dg2HashSalt, BigInt(identity.dg2HashType))
  return {
    salted_dg1: hideSensitiveInputs
      ? SaltedValue.fromHash(
          await saltedDg1.getHash(),
          Array.from({ length: 95 }, () => 0),
        ).formatForInput()
      : saltedDg1.formatForInput(),
    salted_private_nullifier: hideSensitiveInputs
      ? SaltedValue.fromHash(await saltedPrivateNullifier.getHash(), 0n).formatForInput()
      : saltedPrivateNullifier.formatForInput(),
    salted_expiry_date: saltedExpiryDate.formatForInput(),
    salted_dg2_hash: saltedDg2Hash.formatForInput(),
    salted_dg2_hash_type: saltedDg2HashType.formatForInput(),
  }
}

export async function getDiscloseCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
) {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getDiscloseCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getDiscloseCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
) {
  return getDiscloseCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getDiscloseCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
) {
  if (nullifierSecret !== 0n && !oprfProof) {
    throw new Error("OPRF proof is required when nullifier secret is not 0")
  }

  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  const discloseMask = getDiscloseMask(identity, query)
  return {
    current_date: currentDateTimestamp,
    ...saltedValues,
    disclose_mask: discloseMask,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

/**
 * Build the 90-byte disclosure mask the proof commits to for a query (fields with `disclose`/`eq`).
 * Shared by getDiscloseCircuitInputs and getMrzDisclosedNames.
 */
export function getDiscloseMask(passport: Pick<PassportViewModel, "mrz">, query: Query): number[] {
  const discloseMask = Array(90).fill(0)
  const fieldsToDisclose: { [key in IDCredential]: boolean } = {} as any
  for (const field in query) {
    if (query[field as IDCredential]?.disclose || query[field as IDCredential]?.eq) {
      fieldsToDisclose[field as IDCredential] = true
    }
  }
  for (const field in fieldsToDisclose) {
    if (fieldsToDisclose[field as IDCredential]) {
      switch (field as IDCredential) {
        case "firstname": {
          const firstNameRange = getFirstNameRange(passport)
          discloseMask.fill(1, firstNameRange[0], firstNameRange[1])
          break
        }
        case "lastname": {
          const lastNameRange = getLastNameRange(passport)
          discloseMask.fill(1, lastNameRange[0], lastNameRange[1])
          break
        }
        case "fullname": {
          const fullNameRange = getFullNameRange(passport)
          discloseMask.fill(1, fullNameRange[0], fullNameRange[1])
          break
        }
        case "birthdate": {
          const birthdateRange = getBirthdateRange(passport)
          discloseMask.fill(1, birthdateRange[0], birthdateRange[1])
          break
        }
        case "document_number": {
          const documentNumberRange = getDocumentNumberRange(passport)
          discloseMask.fill(1, documentNumberRange[0], documentNumberRange[1])
          break
        }
        case "nationality": {
          const nationalityRange = getNationalityRange(passport)
          discloseMask.fill(1, nationalityRange[0], nationalityRange[1])
          break
        }
        case "document_type": {
          discloseMask.fill(1, 0, 2)
          break
        }
        case "expiry_date": {
          const expiryDateRange = getExpiryDateRange(passport)
          discloseMask.fill(1, expiryDateRange[0], expiryDateRange[1])
          break
        }
        case "gender": {
          const genderRange = getGenderRange(passport)
          discloseMask.fill(1, genderRange[0], genderRange[1])
          break
        }
        case "issuing_country": {
          discloseMask.fill(1, 2, 5)
          break
        }
      }
    }
  }
  return discloseMask
}

/**
 * Reconstruct the disclosed name fields from the MRZ the same way the verifier does: apply the
 * proof's disclosure mask and parse with DisclosedData.fromDisclosedBytes. Reusing getDiscloseMask
 * keeps the result in lockstep with PublicInputChecker, independent of the DG11 display name.
 */
export function getMrzDisclosedNames(
  passport: Pick<PassportViewModel, "mrz">,
  query: Query,
): { firstName: string; lastName: string; fullName: string } {
  // Same heuristic the name-range getters use to pick the MRZ layout
  const isIDCard = passport.mrz.length === 90
  const disclosedBytes = getDisclosedBytesFromMrzAndMask(
    passport.mrz,
    getDiscloseMask(passport, query),
  )
  const data = DisclosedData.fromDisclosedBytes(disclosedBytes, isIDCard ? "id_card" : "passport")
  return { firstName: data.firstName, lastName: data.lastName, fullName: data.name }
}

export function calculateAge(passport: Pick<PassportViewModel, "dateOfBirth">, now?: Date): number {
  const birthdate = passport.dateOfBirth
  if (!birthdate) return 0
  const birthdateDate = parseDate(new TextEncoder().encode(birthdate))
  const currentDate = now ?? new Date()

  let age = currentDate.getFullYear() - birthdateDate.getFullYear()
  const monthDiff = currentDate.getMonth() - birthdateDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < birthdateDate.getDate())) {
    age--
  }
  return age
}

export async function getAgeCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getAgeCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getAgeCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  return getAgeCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getAgeCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  if (nullifierSecret !== 0n && !oprfProof) {
    throw new Error("OPRF proof is required when nullifier secret is not 0")
  }

  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  const age = calculateAge(identity)

  let minAge = 0
  let maxAge = 0
  if (query.age) {
    if (query.age.gt) {
      // Add 1 to the age as the circuit bounds are inclusive
      minAge = (query.age.gt as number) + 1
    } else if (query.age.gte) {
      minAge = query.age.gte as number
    } else if (query.age.range) {
      minAge = query.age.range[0] as number
      maxAge = query.age.range[1] as number
    } else if (query.age.eq) {
      minAge = query.age.eq as number
      maxAge = query.age.eq as number
    } else if (query.age.disclose) {
      minAge = age
      maxAge = age
    }

    if (query.age.lt) {
      // Subtract 1 from the age as the circuit bounds are inclusive
      maxAge = (query.age.lt as number) - 1
    } else if (query.age.lte) {
      maxAge = query.age.lte as number
    }
  }

  return {
    ...saltedValues,
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    min_age_required: minAge,
    max_age_required: maxAge,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

function padCountryList(countryList: string[]): string[] {
  const paddedCountryList = Array(200).fill(new TextDecoder().decode(new Uint8Array([0, 0, 0])))
  for (let i = 0; i < countryList.length; i++) {
    paddedCountryList[i] = countryList[i]
  }
  return paddedCountryList
}

export async function getNationalityInclusionCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getNationalityInclusionCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getNationalityInclusionCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  return getNationalityInclusionCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getNationalityInclusionCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  if (nullifierSecret !== 0n && !oprfProof) {
    throw new Error("OPRF proof is required when nullifier secret is not 0")
  }

  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  return {
    ...saltedValues,
    country_list: padCountryList(query.nationality?.in ?? []),
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

export async function getIssuingCountryInclusionCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getIssuingCountryInclusionCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getIssuingCountryInclusionCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  return getIssuingCountryInclusionCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getIssuingCountryInclusionCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  if (nullifierSecret !== 0n && !oprfProof) {
    throw new Error("OPRF proof is required when nullifier secret is not 0")
  }

  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  return {
    ...saltedValues,
    country_list: padCountryList(query.issuing_country?.in ?? []),
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

export async function getNationalityExclusionCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getNationalityExclusionCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getNationalityExclusionCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  return getNationalityExclusionCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getNationalityExclusionCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  if (nullifierSecret !== 0n && !oprfProof) {
    throw new Error("OPRF proof is required when nullifier secret is not 0")
  }

  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  const countryList: number[] = []
  for (let i = 0; i < (query.nationality?.out ?? []).length; i++) {
    const country: string = (query.nationality?.out ?? [])[i]
    countryList.push(getCountryWeightedSum(country as Alpha3Code))
  }

  return {
    ...saltedValues,
    current_date: currentDateTimestamp,
    // Sort the country list in ascending order
    country_list: rightPadArrayWithZeros(
      countryList.sort((a, b) => a - b),
      200,
    ),
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

export async function getIssuingCountryExclusionCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getIssuingCountryExclusionCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getIssuingCountryExclusionCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  return getIssuingCountryExclusionCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getIssuingCountryExclusionCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  const countryList: number[] = []
  for (let i = 0; i < (query.issuing_country?.out ?? []).length; i++) {
    const country: string = (query.issuing_country?.out ?? [])[i]
    countryList.push(getCountryWeightedSum(country as Alpha3Code))
  }

  return {
    ...saltedValues,
    current_date: currentDateTimestamp,
    // Sort the country list in ascending order
    country_list: rightPadArrayWithZeros(
      countryList.sort((a, b) => a - b),
      200,
    ),
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

export async function getSanctionsExclusionCheckCircuitInputs(
  passport: PassportViewModel,
  isStrict: boolean,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
  sanctions?: SanctionsBuilder, // Optional sanctions builder so it can be reused if already instantiated
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getSanctionsExclusionCheckCircuitInputsFromIdentity(
    identity,
    isStrict,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
    sanctions,
  )
}

export async function getSanctionsExclusionCheckCircuitInputsFromWitness(
  witness: DisclosureWitness,
  isStrict: boolean,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
  sanctions?: SanctionsBuilder,
): Promise<any> {
  return getSanctionsExclusionCheckCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    isStrict,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
    sanctions,
  )
}

export async function getSanctionsExclusionCheckCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  isStrict: boolean,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
  sanctions?: SanctionsBuilder,
): Promise<any> {
  if (nullifierSecret !== 0n && !oprfProof) {
    throw new Error("OPRF proof is required when nullifier secret is not 0")
  }

  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  // Only build the merkle trees if they are not provided
  sanctions = sanctions ?? (await SanctionsBuilder.create())
  const { proofs, root } = await sanctions.getSanctionsMerkleProofs(identity, isStrict)

  return {
    ...saltedValues,
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    proofs,
    is_strict: isStrict ? 1 : 0,
    root,
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

export async function getBirthdateCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getBirthdateCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getBirthdateCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  return getBirthdateCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getBirthdateCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  if (nullifierSecret !== 0n && !oprfProof) {
    throw new Error("OPRF proof is required when nullifier secret is not 0")
  }

  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  let minDate: Date | undefined
  let maxDate: Date | undefined
  if (query.birthdate) {
    if (query.birthdate.gt) {
      const gtDate = new Date(query.birthdate.gt)
      // Add 1 day to the date as the circuit bounds are inclusive
      minDate = new Date(gtDate.setDate(gtDate.getDate() + 1))
    } else if (query.birthdate.gte) {
      minDate = query.birthdate.gte as Date
    } else if (query.birthdate.range) {
      minDate = query.birthdate.range[0] as Date
      maxDate = query.birthdate.range[1] as Date
    } else if (query.birthdate.eq) {
      minDate = query.birthdate.eq as Date
      maxDate = query.birthdate.eq as Date
    } else if (query.birthdate.disclose) {
      minDate = parseDate(new TextEncoder().encode(identity.dateOfBirth))
      maxDate = parseDate(new TextEncoder().encode(identity.dateOfBirth))
    }

    if (query.birthdate.lt) {
      const ltDate = new Date(query.birthdate.lt)
      // Subtract 1 day from the date as the circuit bounds are inclusive
      maxDate = new Date(ltDate.setDate(ltDate.getDate() - 1))
    } else if (query.birthdate.lte) {
      maxDate = query.birthdate.lte as Date
    }
  }

  return {
    ...saltedValues,
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    // Add the seconds between 1900 and 1970 to the date to get the correct date
    // This is because the circuit expects the epoch to be 1900 rather than 1970
    // for min_date and max_date
    min_date: minDate ? getUnixTimestamp(minDate) + SECONDS_BETWEEN_1900_AND_1970 : 0,
    max_date: maxDate ? getUnixTimestamp(maxDate) + SECONDS_BETWEEN_1900_AND_1970 : 0,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

export async function getExpiryDateCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getExpiryDateCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getExpiryDateCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  return getExpiryDateCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
  )
}

export async function getExpiryDateCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
): Promise<any> {
  if (nullifierSecret !== 0n && !oprfProof) {
    throw new Error("OPRF proof is required when nullifier secret is not 0")
  }

  const { commIn, saltedValues } = await getDisclosureCoreInputs(identity, salts)

  let minDate: Date | undefined
  let maxDate: Date | undefined
  if (query.expiry_date) {
    if (query.expiry_date.gt) {
      const gtDate = new Date(query.expiry_date.gt)
      // Add 1 day to the date as the circuit bounds are inclusive
      minDate = new Date(gtDate.setDate(gtDate.getDate() + 1))
    } else if (query.expiry_date.gte) {
      minDate = query.expiry_date.gte as Date
    } else if (query.expiry_date.range) {
      minDate = query.expiry_date.range[0] as Date
      maxDate = query.expiry_date.range[1] as Date
    } else if (query.expiry_date.eq) {
      minDate = query.expiry_date.eq as Date
      maxDate = query.expiry_date.eq as Date
    } else if (query.expiry_date.disclose) {
      minDate = parseDate(new TextEncoder().encode(identity.passportExpiry))
      maxDate = parseDate(new TextEncoder().encode(identity.passportExpiry))
    }

    if (query.expiry_date.lt) {
      const ltDate = new Date(query.expiry_date.lt)
      // Subtract 1 day from the date as the circuit bounds are inclusive
      maxDate = new Date(ltDate.setDate(ltDate.getDate() - 1))
    } else if (query.expiry_date.lte) {
      maxDate = query.expiry_date.lte as Date
    }
  }

  return {
    ...saltedValues,
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    min_date: minDate ? getUnixTimestamp(minDate) : 0,
    max_date: maxDate ? getUnixTimestamp(maxDate) : 0,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

export async function getBindCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
  hideSensitiveInputs: boolean = false,
): Promise<any> {
  const identity = await getDisclosureIdentityFromPassport(passport)
  if (!identity) return null
  return getBindCircuitInputsFromIdentity(
    identity,
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
    hideSensitiveInputs,
  )
}

export async function getBindCircuitInputsFromWitness(
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
  hideSensitiveInputs: boolean = false,
): Promise<any> {
  return getBindCircuitInputsFromIdentity(
    await getDisclosureIdentityFromWitness(witness),
    query,
    salts,
    nullifierSecret,
    service_scope,
    service_subscope,
    currentDateTimestamp,
    oprfProof,
    hideSensitiveInputs,
  )
}

export async function getBindCircuitInputsFromIdentity(
  identity: DisclosureIdentityData,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  oprfProof: OPRFProof = OPRF_ZERO_PROOF,
  hideSensitiveInputs: boolean = false,
): Promise<any> {
  const { commIn, saltedValues } = await getDisclosureCoreInputs(
    identity,
    salts,
    hideSensitiveInputs,
  )

  const data = formatBoundData(query.bind ?? {})

  return {
    ...saltedValues,
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    data: rightPadArrayWithZeros(data, 509),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
    oprf_proof: oprfProof,
  }
}

export async function getFacematchCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
  hideSensitiveInputs: boolean = false,
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) throw new Error("Error getting ID data inputs")
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(idData.e_content).padEnd(E_CONTENT_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1Dg2HashPrivateNullifier(
    salts,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    passport.passportExpiry,
    idData.dg2_hash_normalized,
    idData.dg2_hash_type,
    privateNullifier.toBigInt(),
  )

  // Default to regular mode when facematch is auto-generated (e.g. for SALTED nullifier without explicit facematch query)
  const facematchMode = query.facematch?.mode ?? "regular"

  return {
    ...(await getSaltedValuesForDisclosureCircuit(
      passport,
      idData,
      privateNullifier,
      salts,
      hideSensitiveInputs,
    )),
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    // FACEMATCH_MODE_REGULAR (1) or FACEMATCH_MODE_STRICT (2)
    facematch_mode: facematchMode === "regular" ? 1 : 2,
    // APP_ATTEST_ENV_DEVELOPMENT (0) or APP_ATTEST_ENV_PRODUCTION (1)
    environment: 1,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
  }
}

/**
 * Generate circuit inputs for the oprf_auth circuit.
 * This circuit proves the blinded OPRF query was derived from the committed DG2 hash.
 */
export async function getOprfAuthCircuitInputs(
  passport: PassportViewModel,
  salts: IntegrityToDisclosureSalts,
  beta: bigint,
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) throw new Error("Error getting ID data inputs")
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(idData.e_content).padEnd(E_CONTENT_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1Dg2HashPrivateNullifier(
    salts,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    passport.passportExpiry,
    idData.dg2_hash_normalized,
    idData.dg2_hash_type,
    privateNullifier.toBigInt(),
  )

  return {
    inputs: {
      ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
      comm_in: commIn.toHex(),
      beta: `0x${beta.toString(16)}`,
    },
    privateNullifier: privateNullifier.toBigInt(),
  }
}

/**
 * Whether the query requests access to the given field (i.e. has at least one
 * non-null condition on it).
 */
export function hasRequestedAccessToField(query: Query, field: IDCredential): boolean {
  const fieldValue = query[field]
  const isDefined = fieldValue !== undefined && fieldValue !== null
  if (!isDefined) {
    return false
  }
  for (const key in fieldValue) {
    if (
      fieldValue[key as keyof typeof fieldValue] !== undefined &&
      fieldValue[key as keyof typeof fieldValue] !== null
    ) {
      return true
    }
  }
  return false
}

/**
 * Determine which disclosure circuits a query requires, using the same selection and
 * dedup rules as the mobile app. Order matters only for stable output.
 * `facematch` is included when requested so callers that cannot prove it (e.g. the
 * browser enrollment flow) can detect it and refuse/fall back.
 */
export function getRequiredDisclosureCircuitNames(
  query: Query,
  evm = false,
): DisclosureCircuitName[] {
  const suffix = evm ? "_evm" : ""
  const names: DisclosureCircuitName[] = []
  const push = (name: string) => {
    const full = `${name}${suffix}` as DisclosureCircuitName
    if (!names.includes(full)) names.push(full)
  }
  const fields = Object.keys(query).filter((key) =>
    hasRequestedAccessToField(query, key as IDCredential),
  )
  for (const field of fields) {
    for (const key in query[field as IDCredential]) {
      switch (key) {
        case "eq":
        case "disclose":
          if (
            field !== "age" &&
            (field !== "expiry_date" || key === "disclose") &&
            (field !== "birthdate" || key === "disclose")
          ) {
            push("disclose_bytes")
          } else if (field === "age") {
            push("compare_age")
          } else if (field === "expiry_date" && key === "eq") {
            push("compare_expiry")
          } else if (field === "birthdate" && key === "eq") {
            push("compare_birthdate")
          }
          break
        case "gte":
        case "gt":
        case "lte":
        case "lt":
        case "range":
          if (field === "age") {
            push("compare_age")
          } else if (field === "expiry_date") {
            push("compare_expiry")
          } else if (field === "birthdate") {
            push("compare_birthdate")
          }
          break
        case "in":
          if (field === "nationality") {
            push("inclusion_check_nationality")
          } else if (field === "issuing_country") {
            push("inclusion_check_issuing_country")
          }
          break
        case "out":
          if (field === "nationality") {
            push("exclusion_check_nationality")
          } else if (field === "issuing_country") {
            push("exclusion_check_issuing_country")
          }
          break
      }
    }
  }
  if (query.bind) {
    push("bind")
  }
  if (query.sanctions) {
    push("exclusion_check_sanctions")
  }
  if (query.facematch) {
    push("facematch")
  }
  // If no circuit is required (proof of valid ID only) or only facematch is required
  // (which may be delegated with a zero nullifier), add a disclose circuit so at least
  // one proof carries a non-zero nullifier
  const nonFacematch = names.filter((n) => !n.startsWith("facematch"))
  if (nonFacematch.length === 0) {
    push("disclose_bytes")
  }
  return names
}

/**
 * Reconstruct the committed inputs carried in a ProofResult from the raw circuit inputs.
 * Same as the mobile app implementation, minus the facematch circuits (which are
 * platform-specific and not supported here).
 */
export function getCommittedInputsForCircuit(
  inputs: any,
  circuitName: DisclosureCircuitName,
): CommittedInputs {
  if (circuitName === "disclose_bytes" || circuitName === "disclose_bytes_evm") {
    return {
      disclosedBytes: inputs.salted_dg1.value
        .slice(5)
        .map((x: number, i: number) => x * inputs.disclose_mask[i]),
      discloseMask: inputs.disclose_mask,
    }
  } else if (circuitName === "compare_age" || circuitName === "compare_age_evm") {
    return {
      minAge: inputs.min_age_required,
      maxAge: inputs.max_age_required,
    }
  } else if (
    circuitName === "compare_expiry" ||
    circuitName === "compare_birthdate" ||
    circuitName === "compare_expiry_evm" ||
    circuitName === "compare_birthdate_evm"
  ) {
    return {
      minDateTimestamp: inputs.min_date,
      maxDateTimestamp: inputs.max_date,
    }
  } else if (
    circuitName === "inclusion_check_nationality" ||
    circuitName === "inclusion_check_nationality_evm" ||
    circuitName === "inclusion_check_issuing_country" ||
    circuitName === "inclusion_check_issuing_country_evm"
  ) {
    return {
      countries: inputs.country_list.filter((x: string) => x !== "\0\0\0"),
    }
  } else if (
    circuitName === "exclusion_check_nationality" ||
    circuitName === "exclusion_check_nationality_evm" ||
    circuitName === "exclusion_check_issuing_country" ||
    circuitName === "exclusion_check_issuing_country_evm"
  ) {
    return {
      countries: inputs.country_list
        .map(getCountryFromWeightedSum)
        .filter((x: string) => x !== "\0\0\0"),
    }
  } else if (circuitName === "bind" || circuitName === "bind_evm") {
    const dataBytes = inputs.data
    let offset = 0
    const boundData: BoundData = {}
    while (offset < 500) {
      if (dataBytes[offset] === BoundDataIdentifier.USER_ADDRESS) {
        const addressLength = dataBytes[offset + 1] * 256 + dataBytes[offset + 2]
        boundData.user_address = Binary.from(
          dataBytes.slice(offset + 3, offset + 3 + addressLength),
        ).toHex()
        offset += 2 + addressLength + 1
      } else if (dataBytes[offset] === BoundDataIdentifier.CHAIN_ID) {
        const chainIdLength = dataBytes[offset + 1] * 256 + dataBytes[offset + 2]
        boundData.chain = getChainFromId(
          Number(Binary.from(dataBytes.slice(offset + 3, offset + 3 + chainIdLength)).toBigInt()),
        )
        offset += 2 + chainIdLength + 1
      } else if (dataBytes[offset] === BoundDataIdentifier.CUSTOM_DATA) {
        const customDataLength = dataBytes[offset + 1] * 256 + dataBytes[offset + 2]
        boundData.custom_data = new TextDecoder().decode(
          new Uint8Array(dataBytes.slice(offset + 3, offset + 3 + customDataLength)),
        )
        offset += 2 + customDataLength + 1
      } else {
        break
      }
    }
    return {
      data: boundData,
    }
  } else if (
    circuitName === "exclusion_check_sanctions" ||
    circuitName === "exclusion_check_sanctions_evm"
  ) {
    return {
      rootHash: inputs.root,
      isStrict: !!inputs.is_strict,
    }
  }
  throw new Error(`Unsupported circuit for committed inputs: ${circuitName}`)
}
