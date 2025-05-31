import { sha256 } from "@noble/hashes/sha2"
import { AsnParser } from "@peculiar/asn1-schema"
import { AuthorityKeyIdentifier, PrivateKeyUsagePeriod } from "@peculiar/asn1-x509"
import { format } from "date-fns"
import { Alpha3Code } from "i18n-iso-countries"
import { redcLimbsFromBytes } from "./barrett-reduction"
import { Binary, HexString } from "./binary"
import {
  calculatePrivateNullifier,
  formatBoundData,
  getCountryWeightedSum,
  hashSaltCountrySignedAttrDg1PrivateNullifier,
  hashSaltCountryTbs,
  hashSaltDg1PrivateNullifier,
} from "./circuits"
import { parseDate } from "./circuits/disclose"
import type { DigestAlgorithm } from "./cms/types"
import { getBitSizeFromCurve, getCurveParams, getECDSAInfo, getRSAInfo } from "./cms/utils"
import { DG1_INPUT_SIZE, SIGNED_ATTR_INPUT_SIZE } from "./constants"
import { countryCodeAlpha2ToAlpha3 } from "./country/country"
import { computeMerkleProof } from "./merkle-tree"
import { extractTBS, getSodSignatureAlgorithmType } from "./passport/passport-reader"
import {
  CERT_TYPE_CSCA,
  CERTIFICATE_REGISTRY_HEIGHT,
  getCertificateLeafHash,
  getCertificateLeafHashes,
  tagsArrayToByteFlag,
} from "./registry"
import type { HashAlgorithm, PackagedCertificate } from "./types"
import {
  DiscloseFlags,
  ECDSADSCDataInputs,
  IDCredential,
  IDDataInputs,
  PassportViewModel,
  Query,
  RSADSCDataInputs,
  RSAPublicKey,
} from "./types"
import {
  bigintToBytes,
  bigintToNumber,
  fromBytesToBigInt,
  getBitSize,
  getOffsetInArray,
  leftPadArrayWithZeros,
  rightPadArrayWithZeros,
} from "./utils"

// @deprecated This list will be removed in a future version
const SUPPORTED_HASH_ALGORITHMS: DigestAlgorithm[] = ["SHA1", "SHA256", "SHA384", "SHA512"]
const SUPPORTED_HASH_ALGORITHMS_USE: HashAlgorithm[] = ["SHA-1", "SHA-256", "SHA-384", "SHA-512"]

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
    } catch (e) {
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
      (rsaInfo.exponent === 3n || rsaInfo.exponent === 65537n)
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
      ((csca.public_key as RSAPublicKey).exponent === 3 ||
        (csca.public_key as RSAPublicKey).exponent === 65537) &&
      SUPPORTED_HASH_ALGORITHMS_USE.includes(csca.hash_algorithm)
    )
  } else if (csca.signature_algorithm == "RSA-PSS" || csca.signature_algorithm == "ECDSA") {
    return SUPPORTED_HASH_ALGORITHMS_USE.includes(csca.hash_algorithm)
  }
  return false
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
    return 1500
  }
}

export function getCscaForPassport(
  passport: PassportViewModel,
  certificates: PackagedCertificate[],
): PackagedCertificate | null {
  const extensions = passport.sod.certificate.tbs.extensions

  let notBefore: number | undefined
  let notAfter: number | undefined
  const pkupBuffer = extensions.get("privateKeyUsagePeriod")?.value.toBuffer()
  if (pkupBuffer) {
    const pkup = AsnParser.parse(pkupBuffer, PrivateKeyUsagePeriod)
    notBefore = pkup.notBefore?.getTime() ?? 0 / 1000
    notAfter = pkup.notAfter?.getTime() ?? 0 / 1000
  }

  let authorityKeyIdentifier: string | undefined
  const akiBuffer = extensions.get("authorityKeyIdentifier")?.value.toBuffer()
  if (akiBuffer) {
    const parsed = AsnParser.parse(akiBuffer, AuthorityKeyIdentifier)
    if (parsed?.keyIdentifier?.buffer) {
      authorityKeyIdentifier = Binary.from(parsed.keyIdentifier.buffer).toHex().replace("0x", "")
    }
  }
  const country = getDSCCountry(passport)
  const formattedCountry = country === "D<<" ? "DEU" : country

  const checkAgainstAuthorityKeyIdentifier = (cert: PackagedCertificate) => {
    return (
      authorityKeyIdentifier &&
      cert.subject_key_identifier?.replace("0x", "") === authorityKeyIdentifier
    )
  }

  const checkAgainstPrivateKeyUsagePeriod = (cert: PackagedCertificate) => {
    return (
      cert.private_key_usage_period &&
      cert.private_key_usage_period?.not_before &&
      cert.private_key_usage_period?.not_after &&
      notBefore &&
      notAfter &&
      notBefore >= (cert.private_key_usage_period?.not_before || 0) &&
      notAfter <= (cert.private_key_usage_period?.not_after || 0)
    )
  }

  const certificate = certificates.find((cert) => {
    return (
      cert.country.toLowerCase() === formattedCountry.toLowerCase() &&
      (checkAgainstAuthorityKeyIdentifier(cert) || checkAgainstPrivateKeyUsagePeriod(cert))
    )
  })
  if (!certificate) {
    console.warn(`Could not find CSC for DSC`)
  }
  return certificate ?? null
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
      pubkey_offset_in_tbs: getOffsetInArray(
        passport?.sod.certificate.tbs.bytes.toNumberArray() ?? [],
        dscPubkeyX,
      ),
      dsc_pubkey_x: dscPubkeyX,
      dsc_pubkey_y: dscPubkeyY,
    }
  } else {
    const { modulus, exponent } = getRSAInfo(tbsCertificate.subjectPublicKeyInfo)
    const modulusBytes = bigintToBytes(modulus)
    return {
      dsc_pubkey: modulusBytes,
      exponent: bigintToNumber(exponent),
      dsc_pubkey_redc_param: redcLimbsFromBytes(modulusBytes),
      tbs_certificate: rightPadArrayWithZeros(
        passport?.sod.certificate.tbs.bytes.toNumberArray() ?? [],
        maxTbsLength,
      ),
      pubkey_offset_in_tbs: getOffsetInArray(
        passport?.sod.certificate.tbs.bytes.toNumberArray() ?? [],
        modulusBytes,
      ),
    }
  }
}

function getIDDataInputs(passport: PassportViewModel): IDDataInputs {
  const dg1 = passport?.dataGroups.find((dg) => dg.groupNumber === 1)
  const eContent = passport?.sod.encapContentInfo.eContent.bytes.toNumberArray()
  const dg1Offset = getOffsetInArray(eContent ?? [], dg1?.hash ?? [])
  const signedAttributes = passport.sod.signerInfo.signedAttrs.bytes.toNumberArray()
  const id_data = {
    // Padded with 0s to make it 700 bytes
    e_content: rightPadArrayWithZeros(eContent ?? [], 700),
    e_content_size: eContent?.length ?? 0,
    dg1_offset_in_e_content: dg1Offset,
    // Padded to 200 bytes with 0s
    signed_attributes: rightPadArrayWithZeros(signedAttributes ?? [], 200),
    signed_attributes_size: signedAttributes.length ?? 0,
    // Padded to 95 bytes with 0s
    dg1: rightPadArrayWithZeros(dg1?.value ?? [], 95),
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
    return [...r, ...s]
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
  const sha2Hash = sha256(value).slice(0, 31)
  // Convert the hash to a bigint
  const bytes = fromBytesToBigInt(Array.from(sha2Hash))
  return bytes
}

export function getServiceScopeHash(domain: string, chainId?: number) {
  const scope = !!chainId ? `${domain}:chain-${chainId}` : domain
  return getScopeHash(scope)
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

export async function getDSCCircuitInputs(
  passport: PassportViewModel,
  salt: bigint,
  certificates: PackagedCertificate[],
  overrideCertLeaves?: bigint[],
  overrideMerkleProof?: {
    root: string | HexString
    index: number
    path: (string | HexString)[]
  },
): Promise<any> {
  // Get the CSCA for this passport's DSC
  const csca = getCscaForPassport(passport, certificates)
  if (!csca) throw new Error("Could not find CSCA for DSC")
  // Generate the certificate registry merkle proof
  const cscaLeaf = await getCertificateLeafHash(csca)
  const leaves = overrideCertLeaves ?? (await getCertificateLeafHashes(certificates))
  const index = leaves.findIndex((leaf) => leaf === cscaLeaf)
  const tags = tagsArrayToByteFlag(csca.tags ?? [])
  const merkleProof =
    overrideMerkleProof ?? (await computeMerkleProof(leaves, index, CERTIFICATE_REGISTRY_HEIGHT))

  const inputs = {
    certificate_registry_root: merkleProof.root,
    certificate_registry_index: merkleProof.index,
    certificate_registry_hash_path: merkleProof.path,
    certificate_tags: `0x${tags.toString(16)}`,
    certificate_type: `0x${CERT_TYPE_CSCA.toString(16)}`,
    country: csca.country,
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
      tbs_certificate_len: passport?.sod.certificate.tbs.bytes.toNumberArray().length,
    }
  } else if (csca.public_key.type === "RSA") {
    const modulusBytes = bigintToBytes(BigInt(csca.public_key.modulus))
    return {
      ...inputs,
      tbs_certificate: rightPadArrayWithZeros(
        passport?.sod.certificate.tbs.bytes.toNumberArray() ?? [],
        maxTbsLength,
      ),
      tbs_certificate_len: passport?.sod.certificate.tbs.bytes.toNumberArray().length,
      dsc_signature: passport?.sod.certificate.signature.toNumberArray() ?? [],
      csc_pubkey: modulusBytes,
      csc_pubkey_redc_param: redcLimbsFromBytes(modulusBytes),
      exponent: csca.public_key.exponent,
    }
  }
}

export async function getIDDataCircuitInputs(
  passport: PassportViewModel,
  saltIn: bigint,
  saltOut: bigint,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  const maxTbsLength = getTBSMaxLen(passport)
  const dscData = getDSCDataInputs(passport, maxTbsLength)
  if (!dscData || !idData) return null

  const commIn = await hashSaltCountryTbs(
    saltIn,
    getDSCCountry(passport),
    passport.sod.certificate.tbs.bytes,
    maxTbsLength,
  )

  const inputs = {
    dg1: idData.dg1,
    signed_attributes: idData.signed_attributes,
    signed_attributes_size: idData.signed_attributes_size,
    comm_in: commIn.toHex(),
    salt_in: `0x${saltIn.toString(16)}`,
    salt_out: `0x${saltOut.toString(16)}`,
  }

  const signatureAlgorithm = getSodSignatureAlgorithmType(passport)
  if (signatureAlgorithm === "ECDSA") {
    return {
      ...inputs,
      tbs_certificate: dscData.tbs_certificate,
      pubkey_offset_in_tbs: dscData.pubkey_offset_in_tbs,
      dsc_pubkey_x: (dscData as ECDSADSCDataInputs).dsc_pubkey_x,
      dsc_pubkey_y: (dscData as ECDSADSCDataInputs).dsc_pubkey_y,
      sod_signature: processSodSignature(
        passport?.sod.signerInfo.signature.toNumberArray() ?? [],
        passport,
      ),
      signed_attributes: idData.signed_attributes,
      signed_attributes_size: idData.signed_attributes_size,
    }
  } else if (signatureAlgorithm === "RSA") {
    return {
      ...inputs,
      dsc_pubkey: (dscData as RSADSCDataInputs).dsc_pubkey,
      exponent: (dscData as RSADSCDataInputs).exponent,
      sod_signature: passport?.sod.signerInfo.signature.toNumberArray() ?? [],
      dsc_pubkey_redc_param: (dscData as RSADSCDataInputs).dsc_pubkey_redc_param,
      tbs_certificate: (dscData as RSADSCDataInputs).tbs_certificate,
      pubkey_offset_in_tbs: (dscData as RSADSCDataInputs).pubkey_offset_in_tbs,
      signed_attributes: idData.signed_attributes,
      signed_attributes_size: idData.signed_attributes_size,
    }
  }
}

export function getDSCCountry(passport: PassportViewModel): string {
  const country = passport.sod.certificate.tbs.issuer?.match(/countryName=([A-Z]+)/)?.[1]
  const formattedCountryCode = country?.length === 2 ? countryCodeAlpha2ToAlpha3(country) : country
  return formattedCountryCode ?? passport.nationality
}

export async function getIntegrityCheckCircuitInputs(
  passport: PassportViewModel,
  saltIn: bigint,
  saltOut: bigint,
): Promise<any> {
  const maxTbsLength = getTBSMaxLen(passport)
  const dscData = getDSCDataInputs(passport, maxTbsLength)
  if (!dscData) return null
  const idData = getIDDataInputs(passport)
  if (!idData) return null

  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const signedAttributes = passport?.sod.signerInfo.signedAttrs.bytes.toNumberArray()
  const comm_in = await hashSaltCountrySignedAttrDg1PrivateNullifier(
    saltIn,
    getDSCCountry(passport),
    Binary.from(signedAttributes).padEnd(SIGNED_ATTR_INPUT_SIZE),
    BigInt(signedAttributes.length),
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  return {
    current_date: format(new Date(), "yyyyMMdd"),
    dg1: idData.dg1,
    signed_attributes: idData.signed_attributes,
    signed_attributes_size: idData.signed_attributes_size,
    e_content: idData.e_content,
    e_content_size: idData.e_content_size,
    dg1_offset_in_e_content: idData.dg1_offset_in_e_content,
    comm_in: comm_in.toHex(),
    private_nullifier: privateNullifier.toHex(),
    salt_in: `0x${saltIn.toString(16)}`,
    salt_out: `0x${saltOut.toString(16)}`,
  }
}

export function getFirstNameRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  const lastNameStartIndex = isIDCard ? 60 : 5
  const firstNameStartIndex = getOffsetInArray(mrz.split(""), ["<", "<"], lastNameStartIndex) + 2
  const firstNameEndIndex = getOffsetInArray(mrz.split(""), ["<"], firstNameStartIndex)
  // Subtract 2 from the start index to include the two angle brackets
  return [firstNameStartIndex - 2, firstNameEndIndex]
}

export function getLastNameRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  const lastNameStartIndex = isIDCard ? 60 : 5
  const lastNameEndIndex = getOffsetInArray(mrz.split(""), ["<", "<"], lastNameStartIndex)
  // Add 2 to the end index to include the two angle brackets
  return [lastNameStartIndex, lastNameEndIndex + 2]
}

export function getFullNameRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 60 : 5, isIDCard ? 90 : 44]
}

function getBirthdateRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 30 : 57, isIDCard ? 36 : 63]
}

function getDocumentNumberRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 5 : 44, isIDCard ? 14 : 53]
}

function getNationalityRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 45 : 54, isIDCard ? 48 : 57]
}

function getExpiryDateRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 38 : 65, isIDCard ? 44 : 71]
}

function getGenderRange(passport: PassportViewModel): [number, number] {
  const mrz = passport?.mrz
  const isIDCard = mrz.length == 90
  return [isIDCard ? 37 : 64, isIDCard ? 38 : 65]
}

export async function getDiscloseCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  const discloseMask = Array(90).fill(0)
  let fieldsToDisclose: { [key in IDCredential]: boolean } = {} as any
  for (const field in query) {
    if (query[field as IDCredential]?.disclose || query[field as IDCredential]?.eq) {
      fieldsToDisclose[field as IDCredential] = true
    }
  }
  for (const field in fieldsToDisclose) {
    if (fieldsToDisclose[field as IDCredential]) {
      switch (field as IDCredential) {
        case "firstname":
          const firstNameRange = getFirstNameRange(passport)
          discloseMask.fill(1, firstNameRange[0], firstNameRange[1])
          break
        case "lastname":
          const lastNameRange = getLastNameRange(passport)
          discloseMask.fill(1, lastNameRange[0], lastNameRange[1])
          break
        case "fullname":
          const fullNameRange = getFullNameRange(passport)
          discloseMask.fill(1, fullNameRange[0], fullNameRange[1])
          break
        case "birthdate":
          const birthdateRange = getBirthdateRange(passport)
          discloseMask.fill(1, birthdateRange[0], birthdateRange[1])
          break
        case "document_number":
          const documentNumberRange = getDocumentNumberRange(passport)
          discloseMask.fill(1, documentNumberRange[0], documentNumberRange[1])
          break
        case "nationality":
          const nationalityRange = getNationalityRange(passport)
          discloseMask.fill(1, nationalityRange[0], nationalityRange[1])
          break
        case "document_type":
          discloseMask.fill(1, 0, 2)
          break
        case "expiry_date":
          const expiryDateRange = getExpiryDateRange(passport)
          discloseMask.fill(1, expiryDateRange[0], expiryDateRange[1])
          break
        case "gender":
          const genderRange = getGenderRange(passport)
          discloseMask.fill(1, genderRange[0], genderRange[1])
          break
        case "issuing_country":
          discloseMask.fill(1, 2, 5)
          break
      }
    }
  }
  return {
    dg1: idData.dg1,
    disclose_mask: discloseMask,
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
  }
}

export async function getDiscloseFlagsCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  const discloseFlags: DiscloseFlags = {
    issuing_country: query.issuing_country?.disclose ?? false,
    nationality: query.nationality?.disclose ?? false,
    document_type: query.document_type?.disclose ?? false,
    document_number: query.document_number?.disclose ?? false,
    date_of_expiry: query.expiry_date?.disclose ?? false,
    date_of_birth: query.birthdate?.disclose ?? false,
    gender: query.gender?.disclose ?? false,
    name: query.fullname?.disclose ?? false,
  }

  return {
    dg1: idData.dg1,
    disclose_flags: discloseFlags,
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
  }
}

export function calculateAge(passport: PassportViewModel): number {
  const birthdate = passport.dateOfBirth
  if (!birthdate) return 0
  const birthdateDate = parseDate(new TextEncoder().encode(birthdate))
  const currentDate = new Date()

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
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  let age = calculateAge(passport)

  let minAge = 0
  let maxAge = 0
  if (query.age) {
    if (query.age.gt) {
      minAge = query.age.gt as number
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
      maxAge = query.age.lt as number
    } else if (query.age.lte) {
      maxAge = query.age.lte as number
    }
  }

  return {
    dg1: idData.dg1,
    current_date: format(new Date(), "yyyyMMdd"),
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
    min_age_required: minAge,
    max_age_required: maxAge,
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
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  return {
    dg1: idData.dg1,
    country_list: padCountryList(query.nationality?.in ?? []),
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
  }
}

export async function getIssuingCountryInclusionCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  return {
    dg1: idData.dg1,
    country_list: padCountryList(query.issuing_country?.in ?? []),
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
  }
}

export async function getNationalityExclusionCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  const countryList: number[] = []
  for (let i = 0; i < (query.nationality?.out ?? []).length; i++) {
    const country: string = (query.nationality?.out ?? [])[i]
    countryList.push(getCountryWeightedSum(country as Alpha3Code))
  }

  return {
    dg1: idData.dg1,
    // Sort the country list in ascending order
    country_list: rightPadArrayWithZeros(
      countryList.sort((a, b) => a - b),
      200,
    ),
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
  }
}

export async function getIssuingCountryExclusionCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  const countryList: number[] = []
  for (let i = 0; i < (query.issuing_country?.out ?? []).length; i++) {
    const country: string = (query.issuing_country?.out ?? [])[i]
    countryList.push(getCountryWeightedSum(country as Alpha3Code))
  }

  return {
    dg1: idData.dg1,
    // Sort the country list in ascending order
    country_list: rightPadArrayWithZeros(
      countryList.sort((a, b) => a - b),
      200,
    ),
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
  }
}

export async function getBirthdateCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  let minDate: Date | undefined
  let maxDate: Date | undefined
  if (query.birthdate) {
    if (query.birthdate.gt) {
      minDate = query.birthdate.gt as Date
    } else if (query.birthdate.gte) {
      minDate = query.birthdate.gte as Date
    } else if (query.birthdate.range) {
      minDate = query.birthdate.range[0] as Date
      maxDate = query.birthdate.range[1] as Date
    } else if (query.birthdate.eq) {
      minDate = query.birthdate.eq as Date
      maxDate = query.birthdate.eq as Date
    } else if (query.birthdate.disclose) {
      minDate = parseDate(new TextEncoder().encode(passport.dateOfBirth))
      maxDate = parseDate(new TextEncoder().encode(passport.dateOfBirth))
    }

    if (query.birthdate.lt) {
      maxDate = query.birthdate.lt as Date
    } else if (query.birthdate.lte) {
      maxDate = query.birthdate.lte as Date
    }
  }

  return {
    dg1: idData.dg1,
    current_date: format(new Date(), "yyyyMMdd"),
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
    // "11111111" means the date is ignored
    min_date: minDate ? format(minDate, "yyyyMMdd") : "1".repeat(8),
    max_date: maxDate ? format(maxDate, "yyyyMMdd") : "1".repeat(8),
  }
}

export async function getExpiryDateCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  let minDate: Date | undefined
  let maxDate: Date | undefined
  if (query.expiry_date) {
    if (query.expiry_date.gt) {
      minDate = query.expiry_date.gt as Date
    } else if (query.expiry_date.gte) {
      minDate = query.expiry_date.gte as Date
    } else if (query.expiry_date.range) {
      minDate = query.expiry_date.range[0] as Date
      maxDate = query.expiry_date.range[1] as Date
    } else if (query.expiry_date.eq) {
      minDate = query.expiry_date.eq as Date
      maxDate = query.expiry_date.eq as Date
    } else if (query.expiry_date.disclose) {
      minDate = parseDate(new TextEncoder().encode(passport.passportExpiry))
      maxDate = parseDate(new TextEncoder().encode(passport.passportExpiry))
    }

    if (query.expiry_date.lt) {
      maxDate = query.expiry_date.lt as Date
    } else if (query.expiry_date.lte) {
      maxDate = query.expiry_date.lte as Date
    }
  }

  return {
    dg1: idData.dg1,
    current_date: format(new Date(), "yyyyMMdd"),
    comm_in: commIn.toHex(),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
    // "11111111" means the date is ignored
    min_date: minDate ? format(minDate, "yyyyMMdd") : "1".repeat(8),
    max_date: maxDate ? format(maxDate, "yyyyMMdd") : "1".repeat(8),
  }
}

export async function getBindCircuitInputs(
  passport: PassportViewModel,
  query: Query,
  salt: bigint,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
): Promise<any> {
  const idData = getIDDataInputs(passport)
  if (!idData) return null
  const privateNullifier = await calculatePrivateNullifier(
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    Binary.from(
      processSodSignature(passport?.sod.signerInfo.signature.toNumberArray() ?? [], passport),
    ),
  )
  const commIn = await hashSaltDg1PrivateNullifier(
    salt,
    Binary.from(idData.dg1).padEnd(DG1_INPUT_SIZE),
    privateNullifier.toBigInt(),
  )

  const data = formatBoundData(query.bind ?? {})

  return {
    dg1: idData.dg1,
    comm_in: commIn.toHex(),
    data: rightPadArrayWithZeros(data, 500),
    private_nullifier: privateNullifier.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    salt: `0x${salt.toString(16)}`,
  }
}
