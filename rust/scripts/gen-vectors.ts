// Generates differential test vectors from the TypeScript oracle
// (@zkpassport/utils + @zkpassport/poseidon2) for rust/crates/zkpassport-core.
//
// Run from inside the utils package (bun resolves the tsconfig with
// experimentalDecorators from the cwd, which the cms ASN.1 imports need):
//
//   cd packages/zkpassport-utils && bun ../../rust/scripts/gen-vectors.ts
//
// Output: rust/vectors/vectors.json (consumed by tests/differential.rs)

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { redcLimbsFromBytes } from "../../packages/zkpassport-utils/src/barrett-reduction"
import {
  packBeBitsIntoField,
  packBeBytesIntoField,
  packBeBytesIntoFields,
  packLeBytesIntoFields,
} from "../../packages/zkpassport-utils/src/utils"
// Direct file import so resolution doesn't depend on the bun store layout
import { poseidon2Hash } from "../../packages/zkpassport-utils/node_modules/@zkpassport/poseidon2/dist/esm/index.js"
import {
  calculatePrivateNullifier,
  hashSaltCountryTbs,
  hashSaltCountrySignedAttrDg1EContentPrivateNullifier,
  packLeBytesAndHashPoseidon2,
  hashSaltDg1Dg2HashPrivateNullifier,
} from "../../packages/zkpassport-utils/src/circuits"
import { SaltedValue } from "../../packages/zkpassport-utils/src/types"
import { Binary } from "../../packages/zkpassport-utils/src/binary"
import {
  getIntegrityCheckCircuitInputs,
  getIDDataCircuitInputs,
  getDSCCircuitInputs,
  getAgeCircuitInputs,
  getDiscloseCircuitInputs,
  getBirthdateCircuitInputs,
  getExpiryDateCircuitInputs,
  getNationalityInclusionCircuitInputs,
  getNationalityExclusionCircuitInputs,
  getIssuingCountryInclusionCircuitInputs,
  getIssuingCountryExclusionCircuitInputs,
  getBindCircuitInputs,
  getCscaForPassportAsync,
  processECDSASignature,
  processSodSignature,
  getDSCCountry,
  getServiceScopeHash,
} from "../../packages/zkpassport-utils/src/circuit-matcher"
import {
  getCertificateLeafHash,
  getCertificateLeafHashes,
} from "../../packages/zkpassport-utils/src/registry"
import rootCertsV1 from "../../packages/zkpassport-utils/tests/fixtures/root-certs-v1.json"
import {
  extractTBS,
  getSodSignatureAlgorithmType,
} from "../../packages/zkpassport-utils/src/passport/passport-reader"
import {
  getECDSAInfo,
  getRSAInfo,
  getCurveParams,
} from "../../packages/zkpassport-utils/src/cms/utils"
import { PASSPORTS } from "../../packages/zkpassport-utils/tests/fixtures/passports"
import johnSODJson from "../../packages/zkpassport-utils/tests/fixtures/john-miller-smith-rsa-2048-sha256.json"
import marySODJson from "../../packages/zkpassport-utils/tests/fixtures/mary-miller-smith-ecdsa-p256-sha256.json"

// Deterministic bytes (LCG) so vectors are reproducible
function lcgBytes(seed: number, len: number): number[] {
  let s = seed >>> 0
  const out: number[] = []
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    out.push((s >>> 16) & 0xff)
  }
  return out
}

const BN254_P = 21888242871839275222246405745257275088548364400416034343698204186575808495617n

// --- redc (Barrett reduction limbs) ---
// Modulus-like inputs: RSA-2048/3072/4096, EC field sizes, and leading bytes
// that produce non-multiple-of-8 bit lengths.
const redc = []
for (const [seed, len, firstByte] of [
  [1, 32, 0xff],
  [2, 48, 0xc0],
  [3, 66, 0x01], // P-521-ish: 521-bit
  [4, 128, 0x80],
  [5, 256, 0xb5], // RSA-2048
  [6, 384, 0x03],
  [7, 512, 0xe1], // RSA-4096
  [8, 256, 0x01],
] as const) {
  const bytes = lcgBytes(seed, len)
  bytes[0] = firstByte
  bytes[len - 1] |= 1
  redc.push({ input: bytes, output: redcLimbsFromBytes(bytes) })
}

// --- packBeBytesIntoField ---
const packBeField = []
for (const [seed, len, max] of [
  [10, 31, 31],
  [11, 32, 32],
  [12, 64, 20],
  [13, 93, 31],
  [14, 8, 8],
] as const) {
  const bytes = lcgBytes(seed, len)
  packBeField.push({
    bytes,
    max_field_size: max,
    result: packBeBytesIntoField(new Uint8Array(bytes), max).toString(),
  })
}

// --- packBeBitsIntoField ---
const packBeBits = []
for (const [seed, len, max] of [
  [20, 64, 254],
  [21, 254, 254],
  [22, 300, 254],
  [23, 10, 4],
] as const) {
  const bits = lcgBytes(seed, len).map((b) => b & 1)
  packBeBits.push({
    bits,
    max_field_size: max,
    result: packBeBitsIntoField(bits, max).toString(),
  })
}

// --- packBeBytesIntoFields / packLeBytesIntoFields ---
const packBeFields = []
const packLeFields = []
for (const [seed, len, chunk] of [
  [30, 1, 31],
  [31, 5, 31],
  [32, 31, 31],
  [33, 32, 31],
  [34, 62, 31],
  [35, 93, 31],
  [36, 95, 31],
  [37, 128, 31],
  [38, 40, 15],
] as const) {
  const bytes = lcgBytes(seed, len)
  packBeFields.push({
    bytes,
    max_chunk_size: chunk,
    result: packBeBytesIntoFields(new Uint8Array(bytes), chunk),
  })
  packLeFields.push({
    bytes,
    max_chunk_size: chunk,
    result: packLeBytesIntoFields(new Uint8Array(bytes), chunk),
  })
}

// --- poseidon2Hash ---
const poseidonCases: bigint[][] = [
  [],
  [0n],
  [1n],
  [1n, 2n],
  [1n, 2n, 3n],
  [1n, 2n, 3n, 4n],
  [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n],
  Array.from({ length: 16 }, (_, i) => BigInt(i + 1)),
  [BN254_P - 1n],
  [BN254_P - 1n, BN254_P - 2n, 12345n],
  lcgBytes(40, 21).map((_, i, a) => (BigInt(a[i]) << 200n) + BigInt(i)),
]
const poseidon2 = poseidonCases.map((inputs) => ({
  inputs: inputs.map((x) => x.toString()),
  result: poseidon2Hash(inputs).toString(),
}))

// --- commitment / nullifier primitives ---
const P256_N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551")
const P521_N = BigInt(
  "0x01fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa51868783bf2f966b7fcc0148f709a5d03bb5c9b8899c47aebb6fb71e91386409",
)

const dg1Sample = lcgBytes(50, 90)
const dg1Padded = [...dg1Sample, 0, 0, 0, 0, 0]
const eContentSample = lcgBytes(51, 104)
const eContentPadded = [...eContentSample, ...new Array(700 - 104).fill(0)]
const sodSigSample = lcgBytes(52, 256)
const signedAttrSample = lcgBytes(53, 107)
const signedAttrPadded = [...signedAttrSample, ...new Array(256 - 107).fill(0)]
const tbsPadded = [...lcgBytes(54, 512), ...new Array(700 - 512).fill(0)]

const SALT_A = 0x1111n
const SALT_B = 0x2222n
const PN_SAMPLE = 0x1234567890abcdefn

const commitments = {
  salted_bytes: {
    salt: SALT_A.toString(),
    bytes: dg1Padded,
    result: (await SaltedValue.fromValue(SALT_A, dg1Padded).getHash()).toString(),
  },
  salted_scalar: {
    salt: SALT_A.toString(),
    value: PN_SAMPLE.toString(),
    result: (await SaltedValue.fromValue(SALT_A, PN_SAMPLE).getHash()).toString(),
  },
  private_nullifier: {
    dg1: dg1Padded,
    e_content: eContentPadded,
    sod_sig: sodSigSample,
    result: (
      await calculatePrivateNullifier(
        Binary.from(dg1Padded),
        Binary.from(eContentPadded),
        Binary.from(sodSigSample),
      )
    )
      .toBigInt()
      .toString(),
  },
  salt_country_tbs: {
    salt: SALT_B.toString(),
    country: "ZKR",
    tbs_padded: tbsPadded,
    result: (await hashSaltCountryTbs(SALT_B, "ZKR", Binary.from(tbsPadded), 700))
      .toBigInt()
      .toString(),
  },
  comm_in: {
    salt: SALT_B.toString(),
    country: "DEU",
    padded_signed_attr: signedAttrPadded,
    signed_attr_size: signedAttrSample.length,
    dg1: dg1Padded,
    e_content: eContentPadded,
    private_nullifier: PN_SAMPLE.toString(),
    result: (
      await hashSaltCountrySignedAttrDg1EContentPrivateNullifier(
        SALT_B,
        "DEU",
        Binary.from(signedAttrPadded),
        BigInt(signedAttrSample.length),
        Binary.from(dg1Padded),
        Binary.from(eContentPadded),
        PN_SAMPLE,
      )
    )
      .toBigInt()
      .toString(),
  },
  pack_le_hash: {
    bytes: lcgBytes(55, 48),
    result: (await packLeBytesAndHashPoseidon2(new Uint8Array(lcgBytes(55, 48)))).toString(),
  },
  salt_dg1_dg2: {
    salts: {
      dg1_salt: SALT_A.toString(),
      expiry_date_salt: SALT_B.toString(),
      dg2_hash_salt: "0x3333",
      private_nullifier_salt: "0x4444",
    },
    dg1: dg1Padded,
    expiry_date: "350101",
    dg2_hash_normalized: PN_SAMPLE.toString(),
    dg2_hash_type: 1,
    private_nullifier: PN_SAMPLE.toString(),
    result: (
      await hashSaltDg1Dg2HashPrivateNullifier(
        {
          dg1Salt: SALT_A,
          expiryDateSalt: SALT_B,
          dg2HashSalt: 0x3333n,
          privateNullifierSalt: 0x4444n,
        },
        Binary.from(dg1Padded),
        "350101",
        PN_SAMPLE,
        1,
        PN_SAMPLE,
      )
    )
      .toBigInt()
      .toString(),
  },
}

// --- processECDSASignature ---
function derSig(r: number[], s: number[]): number[] {
  const rEnc = [0x02, r.length, ...r]
  const sEnc = [0x02, s.length, ...s]
  const inner = [...rEnc, ...sEnc]
  if (inner.length < 128) return [0x30, inner.length, ...inner]
  return [0x30, 0x81, inner.length, ...inner]
}
const curveParams = (n: bigint) => ({ a: 0n, b: 0n, p: 0n, n })
const rHigh = [0x80, ...lcgBytes(60, 31)]
const sHigh = [0xff, ...lcgBytes(61, 31)] // > n/2 for p256 → low-s flip
const sLow = [0x01, ...lcgBytes(62, 31)]
const r521 = [0x01, ...lcgBytes(63, 65)]
const s521High = [0x01, 0xff, ...lcgBytes(64, 64)]
const ecdsaCases: { signature: number[]; byte_size: number; n: string }[] = [
  // raw r||s, high s (low-s flip on the raw path)
  { signature: [...rHigh, ...sHigh], byte_size: 32, n: P256_N.toString() },
  // DER, leading-zero-padded r, low s
  { signature: derSig([0x00, ...rHigh], sLow), byte_size: 32, n: P256_N.toString() },
  // DER, high s → flip
  { signature: derSig(rHigh, sHigh), byte_size: 32, n: P256_N.toString() },
  // DER with short r (stripped zeros → left-pad back)
  { signature: derSig(lcgBytes(65, 20), sLow), byte_size: 32, n: P256_N.toString() },
  // not ASN.1 → passthrough
  { signature: [0x31, 0x05, 1, 2, 3, 4, 5], byte_size: 32, n: P256_N.toString() },
  // p521-style long-form DER length
  { signature: derSig(r521, s521High), byte_size: 66, n: P521_N.toString() },
]
const ecdsa = ecdsaCases.map((c) => ({
  ...c,
  result: processECDSASignature(c.signature, c.byte_size, curveParams(BigInt(c.n))),
}))

// --- full integrity-check circuit inputs (real passport fixtures) ---
const INTEGRITY_SALTS = {
  dg1Salt: 0xaaaan,
  expiryDateSalt: 0xbbbbn,
  dg2HashSalt: 0xccccn,
  privateNullifierSalt: 0xddddn,
}
const SALT_IN = 0x9999n
const integrity = []
for (const name of ["john", "mary"]) {
  const passport = PASSPORTS[name]
  const rawSig = passport.sod.signerInfo.signature.toNumberArray()
  integrity.push({
    name,
    dg1: passport.dataGroups.find((dg: any) => dg.groupNumber === 1)!.value,
    e_content: passport.sod.encapContentInfo.eContent.bytes.toNumberArray(),
    signed_attributes: passport.sod.signerInfo.signedAttrs.bytes.toNumberArray(),
    sod_signature_processed: processSodSignature(rawSig, passport),
    dsc_country: getDSCCountry(passport.sod.certificate),
    salt_in: SALT_IN.toString(),
    salts: {
      dg1_salt: INTEGRITY_SALTS.dg1Salt.toString(),
      expiry_date_salt: INTEGRITY_SALTS.expiryDateSalt.toString(),
      dg2_hash_salt: INTEGRITY_SALTS.dg2HashSalt.toString(),
      private_nullifier_salt: INTEGRITY_SALTS.privateNullifierSalt.toString(),
    },
    expected: await getIntegrityCheckCircuitInputs(passport, SALT_IN, INTEGRITY_SALTS),
  })
}

// --- full ID-data circuit inputs (real passport fixtures) ---
const SALT_OUT = 0x7777n
const idData = []
for (const name of ["john", "mary"]) {
  const passport = PASSPORTS[name]
  const sigType = getSodSignatureAlgorithmType(passport)
  const tbsCert = extractTBS(passport)!
  let rsa = null
  let ecdsa_key = null
  if (sigType === "ECDSA") {
    const info = getECDSAInfo(tbsCert.subjectPublicKeyInfo)
    ecdsa_key = {
      public_key: Array.from(info.publicKey),
      n: getCurveParams(info.curve).n.toString(),
      byte_size: (info.publicKey.length - 1) / 2,
    }
  } else {
    const info = getRSAInfo(tbsCert.subjectPublicKeyInfo)
    rsa = { modulus: info.modulus.toString(), exponent: Number(info.exponent) }
  }
  const expected = (await getIDDataCircuitInputs(passport, SALT_IN, SALT_OUT)) as any
  idData.push({
    name,
    dg1: passport.dataGroups.find((dg: any) => dg.groupNumber === 1)!.value,
    e_content: passport.sod.encapContentInfo.eContent.bytes.toNumberArray(),
    signed_attributes: passport.sod.signerInfo.signedAttrs.bytes.toNumberArray(),
    sod_signature: passport.sod.signerInfo.signature.toNumberArray(),
    tbs_certificate: passport.sod.certificate.tbs.bytes.toNumberArray(),
    dsc_country: getDSCCountry(passport.sod.certificate),
    rsa,
    ecdsa: ecdsa_key,
    // pss derivation stays in the SOD-parsing milestone; feed the TS value through
    pss_salt_len: expected.pss_salt_len ?? 0,
    salt_in: SALT_IN.toString(),
    salt_out: SALT_OUT.toString(),
    expected,
  })
}

// --- DSC circuit inputs (real fixtures + v1 packaged certs) ---
const certsFile = rootCertsV1 as any
const certLeaves = await getCertificateLeafHashes(certsFile.certificates, certsFile.version)
// standalone leaf-hash vectors on a few certs (RSA, EC, tagged)
const leafSamples = []
for (const cert of [
  certsFile.certificates.find((c: any) => c.public_key.type === "RSA"),
  certsFile.certificates.find((c: any) => c.public_key.type === "EC"),
  certsFile.certificates.find((c: any) => (c.tags ?? []).length > 0),
]) {
  leafSamples.push({
    cert,
    version: certsFile.version,
    result: (await getCertificateLeafHash(cert, { version: certsFile.version })).toString(),
  })
}
const dsc = []
for (const name of ["john", "mary"]) {
  const passport = PASSPORTS[name]
  const csca = await getCscaForPassportAsync(passport.sod.certificate, certsFile.certificates)
  const expected = (await getDSCCircuitInputs(passport, SALT_IN, certsFile)) as any
  dsc.push({
    name,
    tbs_certificate: passport.sod.certificate.tbs.bytes.toNumberArray(),
    dsc_signature: passport.sod.certificate.signature.toNumberArray(),
    csca,
    pss_salt_len: expected.pss_salt_len ?? 0,
    salt: SALT_IN.toString(),
    expected,
  })
}
const dscMeta = {
  version: certsFile.version,
  root: certsFile.root,
  timestamp: certsFile.timestamp,
  revocations: certsFile.revocations ?? [],
  masterlists: certsFile.masterlists ?? [],
  cert_leaves: certLeaves.map((l) => l.toString()),
}

// --- age disclosure circuit inputs ---
const AGE_TS = 1789000000
const SCOPE = 0x1234n
const SUBSCOPE = 0x56n
const ageQueries: { label: string; query: any }[] = [
  { label: "gte18", query: { age: { gte: 18 } } },
  { label: "gt20_lte65", query: { age: { gt: 20, lte: 65 } } },
]
const age = []
for (const name of ["john", "mary"]) {
  const passport = PASSPORTS[name]
  for (const { label, query } of ageQueries) {
    const expected = await getAgeCircuitInputs(
      passport,
      query,
      INTEGRITY_SALTS,
      0n,
      SCOPE,
      SUBSCOPE,
      AGE_TS,
    )
    age.push({
      name: `${name}:${label}`,
      dg1: passport.dataGroups.find((dg: any) => dg.groupNumber === 1)!.value,
      e_content: passport.sod.encapContentInfo.eContent.bytes.toNumberArray(),
      sod_signature_processed: processSodSignature(
        passport.sod.signerInfo.signature.toNumberArray(),
        passport,
      ),
      dg2_hash: passport.dataGroups.find((dg: any) => dg.groupNumber === 2)!.hash,
      expiry_date: passport.passportExpiry,
      query: query.age,
      salts: {
        dg1_salt: INTEGRITY_SALTS.dg1Salt.toString(),
        expiry_date_salt: INTEGRITY_SALTS.expiryDateSalt.toString(),
        dg2_hash_salt: INTEGRITY_SALTS.dg2HashSalt.toString(),
        private_nullifier_salt: INTEGRITY_SALTS.privateNullifierSalt.toString(),
      },
      service_scope: SCOPE.toString(),
      service_subscope: SUBSCOPE.toString(),
      current_date: AGE_TS,
      expected,
    })
  }
}

// --- SOD parsing (raw DER → extracted fields) ---
const sodEncoded: Record<string, string> = {
  john: (johnSODJson as any).encoded,
  mary: (marySODJson as any).encoded,
}
const sod = []
for (const name of ["john", "mary"]) {
  const passport = PASSPORTS[name]
  const s = passport.sod
  const sigType = getSodSignatureAlgorithmType(passport)
  const tbsCert = extractTBS(passport)!
  let public_key: any
  if (sigType === "ECDSA") {
    const info = getECDSAInfo(tbsCert.subjectPublicKeyInfo)
    public_key = {
      type: "ecdsa",
      public_key: Array.from(info.publicKey),
      curve: info.curve,
    }
  } else {
    const info = getRSAInfo(tbsCert.subjectPublicKeyInfo)
    public_key = { type: "rsa", modulus: info.modulus.toString(), exponent: Number(info.exponent) }
  }
  sod.push({
    name,
    sod_base64: sodEncoded[name],
    expected: {
      e_content: s.encapContentInfo.eContent.bytes.toNumberArray(),
      signed_attributes: s.signerInfo.signedAttrs.bytes.toNumberArray(),
      signer_signature: s.signerInfo.signature.toNumberArray(),
      signer_sig_alg: s.signerInfo.signatureAlgorithm.name,
      signer_sig_alg_params: s.signerInfo.signatureAlgorithm.parameters
        ? s.signerInfo.signatureAlgorithm.parameters.toNumberArray()
        : null,
      signer_digest_alg: s.signerInfo.digestAlgorithm,
      dg_hash_alg: s.encapContentInfo.eContent.hashAlgorithm,
      dg_hashes: Object.entries(s.encapContentInfo.eContent.dataGroupHashValues.values).map(
        ([num, hash]: [string, any]) => [Number(num), hash.toNumberArray()],
      ),
      tbs_certificate: s.certificate.tbs.bytes.toNumberArray(),
      cert_sig_alg: s.certificate.signatureAlgorithm.name,
      cert_signature: s.certificate.signature.toNumberArray(),
      dsc_country: getDSCCountry(s.certificate),
      signature_type: sigType,
      public_key,
    },
  })
}

// --- circuit selection names ---
// Verbatim replica of the name-building in zkpassport-mobile-app
// src/lib/circuit-matcher.ts (getDSCCircuit / buildCircuitNameFromDetectedAlgorithm /
// getIntegrityCheckCircuit). That file imports react-native so it can't be
// imported here directly. TODO: move this logic into @zkpassport/utils and
// import it in both the app and this script.
import { getTBSMaxLen, getBitSize } from "../../packages/zkpassport-utils/src"
import { getRSAPSSParams } from "../../packages/zkpassport-utils/src/cms/utils"

function cscSignatureHashAlgorithm(sod: any): string {
  const DEFAULT = "SHA-256"
  const dsc = sod.certificate
  if (!dsc?.signatureAlgorithm?.name) return DEFAULT
  if (dsc.signatureAlgorithm.name.toLowerCase().includes("pss")) {
    if (dsc.signatureAlgorithm.parameters) {
      const params = getRSAPSSParams(dsc.signatureAlgorithm.parameters.toBuffer())
      return params.hashAlgorithm.replace("SHA", "SHA-")
    }
    return DEFAULT
  }
  for (const sha of ["sha1", "sha224", "sha256", "sha384", "sha512"]) {
    if (dsc.signatureAlgorithm.name.toLowerCase().includes(sha))
      return sha.toUpperCase().replace("SHA", "SHA-")
  }
  return DEFAULT
}

function sodSigHashAlgorithm(passport: any): string {
  const sigAlg = passport.sod.signerInfo.signatureAlgorithm.name.toLowerCase()
  for (const sha of ["sha1", "sha224", "sha256", "sha384", "sha512"]) {
    if (sigAlg.includes(sha)) return sha
  }
  return passport.sod.signerInfo.digestAlgorithm.toLowerCase().replace("-", "")
}

function expectedCircuitNames(passport: any, csca: any) {
  const tbsMaxLen = getTBSMaxLen(passport)
  // DSC
  const cscHash = cscSignatureHashAlgorithm(passport.sod).replace("SHA-", "sha")
  let dscName: string
  if (csca.signature_algorithm.toLowerCase().includes("ecdsa")) {
    const curve = csca.public_key.curve as string
    const family = curve.includes("brainpool") ? "brainpool" : "nist"
    const name = curve.replace("brainpoolP", "").replace("nist", "").replace("-", "").toLowerCase()
    dscName = `sig_check_dsc_tbs_${tbsMaxLen}_ecdsa_${family}_${name}_${cscHash}`
  } else {
    const modulusBits = getBitSize(BigInt(csca.public_key.modulus))
    const scheme = csca.signature_algorithm === "RSA-PSS" ? "pss" : "pkcs"
    dscName = `sig_check_dsc_tbs_${tbsMaxLen}_rsa_${scheme}_${modulusBits}_${cscHash}`
  }
  // ID data (primary detected-algorithm path)
  const tbsCert = extractTBS(passport)!
  const sigType = getSodSignatureAlgorithmType(passport)
  let idName: string
  if (sigType === "ECDSA") {
    const info = getECDSAInfo(tbsCert.subjectPublicKeyInfo)
    const family = info.curve.includes("brainpool") ? "brainpool" : "nist"
    const name = info.curve
      .replace("brainpoolP", "")
      .replace("nist", "")
      .replace("-", "")
      .toLowerCase()
    idName = `sig_check_id_data_tbs_${tbsMaxLen}_ecdsa_${family}_${name}_${sodSigHashAlgorithm(passport)}`
  } else {
    const info = getRSAInfo(tbsCert.subjectPublicKeyInfo)
    const modulusBits = getBitSize(info.modulus)
    const isPss = passport.sod.signerInfo.signatureAlgorithm.name.toLowerCase().includes("pss")
    const hash = isPss
      ? getRSAPSSParams(passport.sod.signerInfo.signatureAlgorithm.parameters!.toBuffer())
          .hashAlgorithm.toLowerCase()
          .replace("-", "")
      : sodSigHashAlgorithm(passport)
    idName = `sig_check_id_data_tbs_${tbsMaxLen}_rsa_${isPss ? "pss" : "pkcs"}_${modulusBits}_${hash}`
  }
  // Integrity
  const sa = passport.sod.signerInfo.digestAlgorithm.toLowerCase().replace("-", "")
  const dg = passport.sod.encapContentInfo.eContent.hashAlgorithm.toLowerCase().replace("-", "")
  return {
    dsc: dscName,
    id_data: idName,
    integrity: `data_check_integrity_sa_${sa}_dg_${dg}`,
    age: "compare_age",
  }
}

const circuitNames = []
for (const name of ["john", "mary"]) {
  const passport = PASSPORTS[name]
  const csca = await getCscaForPassportAsync(passport.sod.certificate, certsFile.certificates)
  circuitNames.push({ name, expected: expectedCircuitNames(passport, csca) })
}

// --- disclosure builders (disclose/date/country/bind) ---
// Rebuild the IntegrityToDisclosureSalts the app derives from one master salt.
function integritySalts(masterSalt: bigint) {
  const publicSalt = BigInt(
    "0x" + Buffer.from(nobleSha256b(masterSalt)).toString("hex"),
  )
  return {
    dg1Salt: masterSalt,
    dg2HashSalt: publicSalt,
    expiryDateSalt: publicSalt,
    privateNullifierSalt: masterSalt,
  }
}
function nobleSha256b(salt: bigint): Uint8Array {
  return require("../../packages/zkpassport-utils/node_modules/@noble/hashes/sha2.js").sha256(
    Buffer.from(salt.toString(16), "hex"),
  )
}
const DISC_SALT = 0xdeadbeefn
const DSALTS = integritySalts(DISC_SALT)
const DTS = 1789000000
const S0 = 0n
const utc = (s: string) => Math.floor(Date.parse(s) / 1000)
const disclosures: any[] = []
for (const name of ["john", "mary"]) {
  const p = PASSPORTS[name]
  const bdMin = utc("1990-01-01T00:00:00Z"), bdMax = utc("2015-01-01T00:00:00Z")
  const exMin = utc("2024-01-01T00:00:00Z")
  disclosures.push(
    {
      label: `${name}:disclose`, kind: "disclose", master_salt: DISC_SALT.toString(),
      fields: { firstname: true, document_type: true },
      expected: await getDiscloseCircuitInputs(p, { firstname: { disclose: true }, document_type: { disclose: true } } as any, DSALTS, 0n, S0, S0, DTS),
    },
    {
      label: `${name}:birthdate`, kind: "birthdate", master_salt: DISC_SALT.toString(),
      min: bdMin, max: bdMax,
      expected: await getBirthdateCircuitInputs(p, { birthdate: { gte: new Date(bdMin * 1000), lte: new Date(bdMax * 1000) } } as any, DSALTS, 0n, S0, S0, DTS),
    },
    {
      label: `${name}:expiry`, kind: "expiry", master_salt: DISC_SALT.toString(),
      min: exMin, max: 0,
      expected: await getExpiryDateCircuitInputs(p, { expiry_date: { gte: new Date(exMin * 1000) } } as any, DSALTS, 0n, S0, S0, DTS),
    },
    {
      label: `${name}:nat_in`, kind: "nat_in", master_salt: DISC_SALT.toString(),
      countries: ["ZKR", "FRA", "DEU"],
      expected: await getNationalityInclusionCircuitInputs(p, { nationality: { in: ["ZKR", "FRA", "DEU"] } } as any, DSALTS, 0n, S0, S0, DTS),
    },
    {
      label: `${name}:issue_out`, kind: "issue_out", master_salt: DISC_SALT.toString(),
      countries: ["AFG", "PRK"],
      expected: await getIssuingCountryExclusionCircuitInputs(p, { issuing_country: { out: ["AFG", "PRK"] } } as any, DSALTS, 0n, S0, S0, DTS),
    },
    {
      label: `${name}:bind`, kind: "bind", master_salt: DISC_SALT.toString(),
      user_address: "0x5e4B11F7B7995F5Cee0134692a422b045091112F", custom_data: "email:test@test.com",
      expected: await getBindCircuitInputs(p, { bind: { user_address: "0x5e4B11F7B7995F5Cee0134692a422b045091112F", custom_data: "email:test@test.com" } } as any, DSALTS, 0n, S0, S0, DTS),
    },
  )
}

// --- getPublicSalt (src/lib/index.ts): sha256(Buffer.from(salt.toString(16),"hex")) ---
import { sha256 as nobleSha256 } from "../../packages/zkpassport-utils/node_modules/@noble/hashes/sha2.js"
function tsPublicSalt(salt: bigint): string {
  const bytes = Buffer.from(salt.toString(16), "hex") // Node drops trailing odd nibble
  return BigInt("0x" + Buffer.from(nobleSha256(bytes)).toString("hex")).toString()
}
const publicSalts = [
  0x1234n,
  0xabcn, // odd-length hex → last nibble dropped
  0x0n,
  BigInt("0x" + "ab".repeat(31)), // 31-byte, even
  BigInt("0x0" + "cd".repeat(30) + "e"), // leading-zero-stripped → odd length
].map((salt) => ({ salt: salt.toString(), result: tsPublicSalt(salt) }))

// --- outer proof assembly (pure functions) ---
const { ultraVkToFields } = require("../../packages/zkpassport-utils/src/circuits/vkey")
const { getProofData } = require("../../packages/zkpassport-utils/src/proof-parser")
const { getNumberOfPublicInputs } = require("../../packages/zkpassport-utils/src/circuits")
const { getOuterCircuitInputs } = require("../../packages/zkpassport-utils/src/recursion")
const {
  getLeavesFromCircuitManifest,
  getCircuitMerkleProof,
} = require("../../packages/zkpassport-utils/src/registry")
const { computeMerkleProof } = require("../../packages/zkpassport-utils/src/merkle-tree")

// numPublicInputs
const numPub = [
  "sig_check_dsc_tbs_700_rsa_pkcs_2048_sha256",
  "sig_check_id_data_tbs_700_ecdsa_nist_p256_sha256",
  "data_check_integrity_sa_sha256_dg_sha256",
  "compare_age",
  "disclose_bytes",
  "oprf_auth",
  "outer_count_6",
  "outer_evm_count_11",
].map((name) => ({ name, count: getNumberOfPublicInputs(name) }))

// ultraVkToFields — random bytes incl a partial last chunk
const vkBytes = lcgBytes(70, 96 + 7)
const ultraVk = { bytes: vkBytes, result: ultraVkToFields(Buffer.from(vkBytes)) }

// getProofData — random proof hex, 2 public inputs
const proofBytes = lcgBytes(71, 32 * 5 + 11)
const proofHex = Buffer.from(proofBytes).toString("hex")
const proofData2 = { proof: proofHex, num: 2, result: getProofData(proofHex, 2) }

// circuit merkle proof against the manifest fixture
const manifestFx = require("../../packages/zkpassport-utils/tests/fixtures/manifest.json")
const someHash = manifestFx.circuits["compare_age"].hash
const cmp = await getCircuitMerkleProof(someHash, manifestFx, computeMerkleProof)
const circuitMerkle = {
  key_hash: someHash,
  index: cmp.index,
  path: cmp.path,
  leaf_count: getLeavesFromCircuitManifest(manifestFx).length,
}

// getOuterCircuitInputs — synthetic OuterCircuitProof objects
function ocp(pis: string[], tag: string) {
  return {
    proof: [`0x${tag}1`],
    publicInputs: pis,
    vkey: [`0x${tag}2`],
    keyHash: `0x${tag}3`,
    treeHashPath: [`0x${tag}4`, `0x${tag}5`],
    treeIndex: `0x${tag}6`,
  }
}
const csc = ocp(["0xa0", "0xa1", "0xa2"], "a")
const dscId = ocp(["0xb0", "0xb1"], "b")
const integ = ocp(["0xc0", "0xc1"], "c")
// disclosure PI: [comm_in, date, scope, subscope, param, nulltype, nullifier, oprf]
const disc1 = ocp(["0xd0", "0x64", "0xd2", "0xd3", "0xd4", "0xd5", "0x99", "0xd7"], "d")
const disc2 = ocp(["0xe0", "0x64", "0xe2", "0xe3", "0xe4", "0xe5", "0x0", "0xe7"], "e")
const outerInputs = {
  circuit_root: "0xabc123",
  result: getOuterCircuitInputs(csc, dscId, integ, [disc1, disc2], "0xabc123"),
}

// --- scope hashes ---
const scopeHashes = ["demo.zkpassport.id", "bank.example.com:proof-of-age", ""].map((value) => ({
  value,
  result: getServiceScopeHash(value).toString(),
}))

const vectors = {
  redc,
  packBeField,
  packBeBits,
  packBeFields,
  packLeFields,
  poseidon2,
  commitments,
  ecdsa,
  integrity,
  idData,
  leafSamples,
  dscMeta,
  dsc,
  age,
  sod,
  scopeHashes,
  circuitNames,
  publicSalts,
  disclosures,
  numPub,
  ultraVk,
  proofData2,
  circuitMerkle,
  outerInputs,
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "vectors")
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, "vectors.json"), JSON.stringify(vectors, null, 1))
console.log(
  `wrote ${Object.entries(vectors)
    .map(([k, v]) => `${k}:${(v as unknown[]).length}`)
    .join(" ")} → rust/vectors/vectors.json`,
)
