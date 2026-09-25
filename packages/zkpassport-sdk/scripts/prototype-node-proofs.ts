/**
 * PROTOTYPE — throwaway spike, not for merge.
 *
 * Question: do proofs generated in Node with bb.js 5.0.0, against the published 0.21.0
 * circuits, pass the SDK's verify({ devMode: true, verifierMode: "local" })?
 *
 * Passport: john (ZKR mock issuer), SOD copied from zkpassport-mobile-app assets/mock-data. Fast mode, no bridge.
 * Query: age >= 18 + nationality disclose → 5 proofs (DSC, ID data, integrity, compare_age,
 * disclose_bytes). Registry: Sepolia, which is what devMode reads and where the ZKR CSCAs live.
 * Circuit naming, salts and committed inputs are copied from zkpassport-mobile-app
 * (src/lib/circuit-matcher.ts, src/lib/index.ts, src/services/ProofService/*).
 *
 * Run from the repo root: bun packages/zkpassport-sdk/scripts/prototype-node-proofs.ts
 */
import { createHash } from "node:crypto"
import { Noir } from "@noir-lang/noir_js"
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js"
import { RegistryClient } from "@zkpassport/registry"
import {
  Binary,
  SOD,
  extractTBS,
  getAgeCircuitInputs,
  getBitSize,
  getCscaForPassportAsync,
  getDiscloseCircuitInputs,
  getDSCCircuitInputs,
  getDSCSignatureAlgorithmHashAlgorithm,
  getIDDataCircuitInputs,
  getIntegrityCheckCircuitInputs,
  getRSAInfo,
  getServiceScopeHash,
  getServiceSubscopeHash,
  getSodSignatureAlgorithmHashAlgorithm,
  getTBSMaxLen,
  type PassportViewModel,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"
import johnSODJson from "./app-john-miller-smith-rsa-2048-sha256.json"
import { ZKPassport } from "../src/index"

const CIRCUIT_VERSION = "0.21.0"
const DOMAIN = "localhost"
const QUERY: Query = { age: { gte: 18 }, nationality: { disclose: true } }
// 31-byte salt with an even-length hex form (the app's getPublicSalt hex-decodes salt.toString(16))
const SALT = BigInt("0x" + "11".repeat(31))

const log = (...args: unknown[]) =>
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...args)
const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

// --- Passport: built like the app's assets/mock-data/passport.ts (john), dataGroups from the SOD's
// own DG hashes. The older zkpassport-utils fixture SOD signs an all-zero DG2 hash, which the 0.21.0
// integrity circuit rejects ("Value cannot be the default value when creating a salted value").
function buildJohn(): PassportViewModel {
  const sod = SOD.fromDER(Binary.fromBase64(johnSODJson.encoded))
  const mrz =
    "P<ZKRSMITH<<JOHN<MILLER<<<<<<<<<<<<<<<<<<<<<ZP1111111_ZKR951112_M350101_<<<<<<<<<<<<<<<<"
  const dg1 = Binary.fromHex("615B5F1F58").concat(Binary.from(mrz))
  return {
    dateOfIssue: "941112",
    appVersion: "",
    mrz,
    name: "John Smith",
    dateOfBirth: "951112",
    nationality: "ZKR",
    gender: "M",
    passportNumber: "ZP1111111",
    passportExpiry: "350101",
    firstName: "John",
    lastName: "Smith",
    fullName: "John Miller Smith",
    photo: "",
    originalPhoto: "",
    chipAuthSupported: false,
    chipAuthSuccess: false,
    chipAuthFailed: false,
    LDSVersion: "",
    dataGroups: Object.entries(sod.encapContentInfo.eContent.dataGroupHashValues.values).map(
      ([key, value]: [string, any]) => ({
        groupNumber: Number(key),
        name: "DG" + key,
        hash: value.toNumberArray(),
        value: key === "1" ? dg1.toNumberArray() : [],
      }),
    ),
    dataGroupsHashAlgorithm: sod.encapContentInfo.eContent.hashAlgorithm,
    sod,
  } as PassportViewModel
}

// --- Salts: copied from zkpassport-mobile-app src/lib/index.ts ---
function getPublicSalt(salt: bigint): bigint {
  return BigInt("0x" + sha256Hex(Buffer.from(salt.toString(16), "hex")))
}
function getIntegrityToDisclosureSalts(salt: bigint) {
  const publicSalt = getPublicSalt(salt)
  return {
    dg1Salt: salt,
    dg2HashSalt: publicSalt,
    expiryDateSalt: publicSalt,
    privateNullifierSalt: salt,
  }
}

// --- Circuit names: copied from the app's circuit-matcher.ts, RSA PKCS branch only (john's DSC and CSCA are RSA) ---
async function getBaseCircuitNames(passport: PassportViewModel, certificates: any[]) {
  const tbsMaxLen = getTBSMaxLen(passport)
  const csca = await getCscaForPassportAsync(passport.sod.certificate, certificates)
  if (!csca) throw new Error("No CSCA found for john's DSC in the Sepolia certificate registry")
  if (!csca.signature_algorithm.toLowerCase().includes("rsa"))
    throw new Error("Prototype handles RSA CSCAs only")
  const cscaBits = getBitSize(BigInt((csca.public_key as any).modulus))
  const cscaScheme = csca.signature_algorithm === "RSA-PSS" ? "pss" : "pkcs"
  const dscHash = getDSCSignatureAlgorithmHashAlgorithm(passport)
  const dsc = `sig_check_dsc_tbs_${tbsMaxLen}_rsa_${cscaScheme}_${cscaBits}_${dscHash}`

  const tbs = extractTBS(passport)
  if (!tbs) throw new Error("Could not extract the DSC TBS")
  const dscBits = getBitSize(getRSAInfo(tbs.subjectPublicKeyInfo).modulus)
  const idScheme = passport.sod.signerInfo.signatureAlgorithm.name.toLowerCase().includes("pss")
    ? "pss"
    : "pkcs"
  const idData = `sig_check_id_data_tbs_${tbsMaxLen}_rsa_${idScheme}_${dscBits}_${getSodSignatureAlgorithmHashAlgorithm(passport)}`

  const saHash = passport.sod.signerInfo.digestAlgorithm.toLowerCase().replace("-", "")
  const dgHash = passport.sod.encapContentInfo.eContent.hashAlgorithm.toLowerCase().replace("-", "")
  const integrity = `data_check_integrity_sa_${saHash}_dg_${dgHash}`
  return { dsc, idData, integrity, csca }
}

async function main() {
  const passport = buildJohn()
  const registry = new RegistryClient({ chainId: 11155111 })

  log("Fetching Sepolia certificates and the", CIRCUIT_VERSION, "circuit manifest")
  const packagedCerts = await registry.getCertificates()
  const manifest = await registry.getCircuitManifest(undefined, { version: CIRCUIT_VERSION })
  log(
    `certificates: ${packagedCerts.certificates.length}, root ${packagedCerts.root?.slice(0, 12)}…; ` +
      `manifest ${manifest.version}, root ${manifest.root.slice(0, 12)}…, ${Object.keys(manifest.circuits).length} circuits`,
  )

  const names = await getBaseCircuitNames(passport, packagedCerts.certificates)
  log(
    "CSCA:",
    names.csca.country,
    names.csca.signature_algorithm,
    "| circuits:",
    names.dsc,
    names.idData,
    names.integrity,
  )

  const integrityToDisclosureSalts = getIntegrityToDisclosureSalts(SALT)
  const serviceScope = getServiceScopeHash(DOMAIN)
  const serviceSubscope = getServiceSubscopeHash(undefined as unknown as string)
  const now = Math.floor(Date.now() / 1000)

  const plan: { name: string; inputs: any; committed?: (inputs: any) => any }[] = [
    { name: names.dsc, inputs: await getDSCCircuitInputs(passport, SALT, packagedCerts) },
    { name: names.idData, inputs: await getIDDataCircuitInputs(passport, SALT, SALT) },
    {
      name: names.integrity,
      inputs: await getIntegrityCheckCircuitInputs(passport, SALT, integrityToDisclosureSalts),
    },
    {
      name: "compare_age",
      inputs: await getAgeCircuitInputs(
        passport,
        QUERY,
        integrityToDisclosureSalts,
        0n,
        serviceScope,
        serviceSubscope,
        now,
      ),
      committed: (i) => ({ minAge: i.min_age_required, maxAge: i.max_age_required }),
    },
    {
      name: "disclose_bytes",
      inputs: await getDiscloseCircuitInputs(
        passport,
        QUERY,
        integrityToDisclosureSalts,
        0n,
        serviceScope,
        serviceSubscope,
        now,
      ),
      committed: (i) => ({
        disclosedBytes: i.salted_dg1.value
          .slice(5)
          .map((x: number, k: number) => x * i.disclose_mask[k]),
        discloseMask: i.disclose_mask,
      }),
    },
  ]

  const bb = await Barretenberg.new()
  const proofs: ProofResult[] = []
  try {
    for (const [index, step] of plan.entries()) {
      if (!step.inputs) throw new Error(`Input builder returned null for ${step.name}`)
      const circuit = await registry.getPackagedCircuit(step.name, manifest)
      const t0 = Date.now()
      const { witness } = await new Noir({
        bytecode: circuit.bytecode,
        abi: circuit.abi,
      } as any).execute(step.inputs)
      const t1 = Date.now()
      const { proof, publicInputs } = await new UltraHonkBackend(
        circuit.bytecode,
        bb,
      ).generateProof(witness)
      const t2 = Date.now()
      // Same layout as the app's generateProof(): [public inputs][proof body], hex, no 0x
      const hex =
        publicInputs.map((x) => x.replace(/^0x/, "").padStart(64, "0")).join("") +
        Buffer.from(proof).toString("hex")
      proofs.push({
        proof: hex,
        vkeyHash: circuit.vkey_hash,
        version: manifest.version as `${number}.${number}.${number}`,
        name: circuit.name,
        index,
        total: plan.length,
        ...(step.committed
          ? { committedInputs: { [circuit.name]: step.committed(step.inputs) } }
          : {}),
      } as ProofResult)
      log(
        `proved ${circuit.name} (size ${circuit.size}): witness ${t1 - t0} ms, proof ${t2 - t1} ms, ` +
          `${publicInputs.length} public inputs, ${proof.length} proof bytes`,
      )
    }
  } finally {
    await bb.destroy()
  }

  const queryResult: QueryResult = {
    age: { gte: { expected: 18, result: true } },
    nationality: { disclose: { result: "ZKR" } },
  }
  const zkPassport = new ZKPassport(DOMAIN)

  log("SDK verify() on the 5 proofs")
  const result = await zkPassport.verify({
    proofs,
    originalQuery: QUERY,
    queryResult,
    devMode: true,
    verifierMode: "local",
  })
  log(
    "result:",
    JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  )

  // Negative control: flip one byte in the body of the disclose proof (after its public inputs).
  // Select by name: verify() sorts the caller's proofs array in place (public-input-checker.ts:2359).
  const tampered = proofs.map((p) => ({ ...p }))
  const last = tampered.find((p) => p.name === "disclose_bytes")!
  const at = (last.proof as string).length - 200
  const flipped = ((parseInt((last.proof as string).slice(at, at + 2), 16) ^ 0xff) & 0xff)
    .toString(16)
    .padStart(2, "0")
  last.proof = (last.proof as string).slice(0, at) + flipped + (last.proof as string).slice(at + 2)
  log("SDK verify() with one byte of the disclose proof flipped (expect verified: false)")
  const tamperedResult = await zkPassport.verify({
    proofs: tampered,
    originalQuery: QUERY,
    queryResult,
    devMode: true,
    verifierMode: "local",
  })
  log(
    "tampered result:",
    JSON.stringify(tamperedResult, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2),
  )

  log(
    result.verified && !tamperedResult.verified
      ? "ANSWER: yes — Node-made proofs pass, and tampering is caught"
      : "ANSWER: no — see results above",
  )
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
