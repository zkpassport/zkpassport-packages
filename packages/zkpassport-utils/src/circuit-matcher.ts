import { sha256 } from "@noble/hashes/sha2"
import { AsnParser } from "@peculiar/asn1-schema"
import { AuthorityKeyIdentifier } from "@peculiar/asn1-x509"
import { Alpha3Code } from "i18n-iso-countries"
import { redcLimbsFromBytes } from "./barrett-reduction"
import { Binary, HexString } from "./binary"
import {
  calculatePrivateNullifier,
  formatBoundData,
  getCountryWeightedSum,
  hashSaltCountrySignedAttrDg1EContentPrivateNullifier,
  hashSaltCountryTbs,
  hashSaltDg1Dg2HashPrivateNullifier,
  normalizeDg2Hash,
  SECONDS_BETWEEN_1900_AND_1970,
} from "./circuits"
import { parseDate } from "./circuits/disclose"
import type { DigestAlgorithm } from "./cms/types"
import { getBitSizeFromCurve, getCurveParams, getECDSAInfo, getRSAInfo } from "./cms/utils"
import { DG1_INPUT_SIZE, E_CONTENT_INPUT_SIZE, SIGNED_ATTR_INPUT_SIZE } from "./constants"
import { countryCodeAlpha2ToAlpha3 } from "./country/country"
import { computeMerkleProof } from "./merkle-tree"
import {
  extractTBS,
  getDSCSignatureHashAlgorithm,
  getSodSignatureAlgorithmType,
} from "./passport/passport-reader"
import {
  CERT_TYPE_CSCA,
  CERTIFICATE_REGISTRY_HEIGHT,
  getCertificateLeafHash,
  getCertificateLeafHashes,
  tagsArrayToBitsFlag,
} from "./registry"
import type { HashAlgorithm, IntegrityToDisclosureSalts, PackagedCertificate } from "./types"
import {
  ECDSADSCDataInputs,
  IDCredential,
  IDDataInputs,
  PassportViewModel,
  Query,
  RSADSCDataInputs,
  RSAPublicKey,
  SaltedValue,
} from "./types"
import {
  bigintToBytes,
  bigintToNumber,
  fromBytesToBigInt,
  getBitSize,
  getHashAlgorithmIdentifierFromLength,
  getUnixTimestamp,
  leftPadArrayWithZeros,
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
import { SanctionsBuilder } from "./circuits/sanctions"
export { SanctionsBuilder }

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
      (csca.public_key as RSAPublicKey).exponent < 131072 &&
      SUPPORTED_HASH_ALGORITHMS_USE.includes(csca.hash_algorithm)
    )
  } else if (csca.signature_algorithm == "RSA-PSS" || csca.signature_algorithm == "ECDSA") {
    return SUPPORTED_HASH_ALGORITHMS_USE.includes(csca.hash_algorithm)
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

export function getCscaForPassport(
  dsc: DSC,
  certificates: PackagedCertificate[],
): PackagedCertificate | null {
  const extensions = dsc.tbs.extensions

  /*let notBefore: number | undefined
  let notAfter: number | undefined
  const pkupBuffer = extensions.get("privateKeyUsagePeriod")?.value.toBuffer()
  if (pkupBuffer) {
    const pkup = AsnParser.parse(pkupBuffer, PrivateKeyUsagePeriod)
    notBefore = (pkup.notBefore?.getTime() ?? 0) / 1000
    notAfter = (pkup.notAfter?.getTime() ?? 0) / 1000
  }*/

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

  /*const checkAgainstPrivateKeyUsagePeriod = (cert: PackagedCertificate) => {
    return (
      cert.private_key_usage_period &&
      cert.private_key_usage_period?.not_before &&
      cert.private_key_usage_period?.not_after &&
      notBefore &&
      notAfter &&
      notBefore >= (cert.private_key_usage_period?.not_before || 0) &&
      notAfter <= (cert.private_key_usage_period?.not_after || 0)
    )
  }*/

  // First try to find the CSC by looking at the authority key identifier
  // which should uniquely identify the CSC that signed the DSC
  const validCertificates = certificates.filter((cert) => {
    return (
      cert.country.toLowerCase() === formattedCountry.toLowerCase() &&
      checkAgainstAuthorityKeyIdentifier(cert)
    )
  })

  // Using the private key usage period is not really reliable, so we don't use it
  /*if (validCertificates.length === 0) {
    // If no certificate was found in the previous step, we use find the CSCs which
    // could have signed the DSCs according to their private key usage period
    validCertificates = certificates.filter((cert) => {
      return (
        cert.country.toLowerCase() === formattedCountry.toLowerCase() &&
        checkAgainstPrivateKeyUsagePeriod(cert)
      )
    })
  }*/

  if (validCertificates.length === 0) {
    return null
  } else if (validCertificates.length === 1) {
    return validCertificates[0]
  } else {
    // Support edge cases where multiple CSCs with the same characteristics are found
    const checkSignatureAlgorithm = (cert: PackagedCertificate) => {
      if (cert.signature_algorithm === "RSA-PSS") {
        return dsc.signatureAlgorithm.name.toLowerCase().includes("pss")
      } else if (cert.signature_algorithm === "RSA") {
        return dsc.signatureAlgorithm.name.toLowerCase().includes("rsa")
      } else if (cert.signature_algorithm === "ECDSA") {
        return dsc.signatureAlgorithm.name.toLowerCase().includes("ecdsa")
      }
      return false
    }
    return (
      validCertificates.find((cert) => {
        return (
          cert.hash_algorithm.replace("-", "").toLowerCase() ===
            getDSCSignatureHashAlgorithm(dsc)?.toLowerCase() && checkSignatureAlgorithm(cert)
        )
      }) ?? null
    )
  }
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
  const sha2Hash = sha256(value).slice(0, 31)
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
) {
  // Get the CSCA for this passport's DSC
  const csca = getCscaForPassport(passport.sod.certificate, certificates)
  if (!csca) throw new Error("Could not find CSCA for DSC")
  // Generate the certificate registry merkle proof
  const cscaLeaf = await getCertificateLeafHash(csca)
  const leaves = overrideCertLeaves ?? (await getCertificateLeafHashes(certificates))
  const index = leaves.findIndex((leaf) => leaf === cscaLeaf)
  const tags = tagsArrayToBitsFlag(csca.tags ?? [])
  const merkleProof =
    overrideMerkleProof ?? (await computeMerkleProof(leaves, index, CERTIFICATE_REGISTRY_HEIGHT))

  const inputs = {
    certificate_registry_root: merkleProof.root,
    certificate_registry_index: merkleProof.index,
    certificate_registry_hash_path: merkleProof.path,
    certificate_tags: tags.map((tag) => `0x${tag.toString(16)}`),
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
    }
  } else if (csca.public_key.type === "RSA") {
    const modulusBits = getBitSize(BigInt(csca.public_key.modulus))
    const modulusBytes = leftPadArrayWithZeros(
      bigintToBytes(BigInt(csca.public_key.modulus)),
      Math.ceil(modulusBits / 8),
    )
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
    }
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

export async function getSaltedValuesForDisclosureCircuit(
  passport: PassportViewModel,
  idData: IDDataInputs,
  privateNullifier: Binary,
  salts: IntegrityToDisclosureSalts,
  hideSensitiveInputs: boolean = false,
) {
  const saltedDg1 = SaltedValue.fromValue(salts.dg1Salt, idData.dg1)
  const saltedPrivateNullifier = SaltedValue.fromValue(
    salts.privateNullifierSalt,
    privateNullifier.toBigInt(),
  )
  const saltedExpiryDate = SaltedValue.fromValue(
    salts.expiryDateSalt,
    passport.passportExpiry.split("").map((char) => char.charCodeAt(0)),
  )
  const saltedDg2Hash = SaltedValue.fromValue(salts.dg2HashSalt, idData.dg2_hash_normalized)
  const saltedDg2HashType = SaltedValue.fromValue(salts.dg2HashSalt, BigInt(idData.dg2_hash_type))
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
) {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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
  return {
    current_date: currentDateTimestamp,
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
    disclose_mask: discloseMask,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
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
  salts: IntegrityToDisclosureSalts,
  nullifierSecret: bigint = 0n,
  service_scope: bigint = 0n,
  service_subscope: bigint = 0n,
  currentDateTimestamp: number,
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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

  const age = calculateAge(passport)

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
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    min_age_required: minAge,
    max_age_required: maxAge,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
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
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
    country_list: padCountryList(query.nationality?.in ?? []),
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
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
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
    country_list: padCountryList(query.issuing_country?.in ?? []),
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
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
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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

  const countryList: number[] = []
  for (let i = 0; i < (query.nationality?.out ?? []).length; i++) {
    const country: string = (query.nationality?.out ?? [])[i]
    countryList.push(getCountryWeightedSum(country as Alpha3Code))
  }

  return {
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
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
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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

  const countryList: number[] = []
  for (let i = 0; i < (query.issuing_country?.out ?? []).length; i++) {
    const country: string = (query.issuing_country?.out ?? [])[i]
    countryList.push(getCountryWeightedSum(country as Alpha3Code))
  }

  return {
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
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
  sanctions?: SanctionsBuilder, // Optional sanctions builder so it can be reused if already instantiated
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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

  // Only build the merkle trees if they are not provided
  sanctions = sanctions ?? (await SanctionsBuilder.create())
  const { proofs, root } = await sanctions.getSanctionsMerkleProofs(passport)

  return {
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    proofs,
    is_strict: isStrict ? 1 : 0,
    root,
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
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
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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
      minDate = parseDate(new TextEncoder().encode(passport.dateOfBirth))
      maxDate = parseDate(new TextEncoder().encode(passport.dateOfBirth))
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
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
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
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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
      minDate = parseDate(new TextEncoder().encode(passport.passportExpiry))
      maxDate = parseDate(new TextEncoder().encode(passport.passportExpiry))
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
    ...(await getSaltedValuesForDisclosureCircuit(passport, idData, privateNullifier, salts)),
    current_date: currentDateTimestamp,
    comm_in: commIn.toHex(),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    min_date: minDate ? getUnixTimestamp(minDate) : 0,
    max_date: maxDate ? getUnixTimestamp(maxDate) : 0,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
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
  hideSensitiveInputs: boolean = false,
): Promise<any> {
  const idData = await getIDDataInputs(passport)
  if (!idData) return null
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

  const data = formatBoundData(query.bind ?? {})

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
    data: rightPadArrayWithZeros(data, 509),
    service_scope: `0x${service_scope.toString(16)}`,
    service_subscope: `0x${service_subscope.toString(16)}`,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
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

  if (!query.facematch) throw new Error("Facematch query is required")

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
    facematch_mode: query.facematch.mode === "regular" ? 1 : 2,
    // APP_ATTEST_ENV_DEVELOPMENT (0) or APP_ATTEST_ENV_PRODUCTION (1)
    environment: 1,
    nullifier_secret: `0x${nullifierSecret.toString(16)}`,
  }
}
