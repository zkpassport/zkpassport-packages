/**
 * zkpassport-aztec harness: generate a real ZKPassport `outer_count_4` proof fixture
 * for the bb-level fixture harness (test-harness/test-recursive-verification.sh).
 *
 * Imports resolve against the `circuits/` submodule (its sources and its node_modules, so
 * the circuits repo's own pinned dep versions are used). Run via generate-proof-fixtures.sh.
 */
import { execSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { poseidon2HashAsync } from "./circuits/node_modules/@zkpassport/poseidon2"
import type { IntegrityToDisclosureSalts, PackagedCertificatesFile, Query } from "./circuits/node_modules/@zkpassport/utils"
import {
  Binary,
  calculatePackagedCertificatesRoot,
  getAgeCircuitInputs,
  getCircuitMerkleProof,
  getCommitmentFromDSCProof,
  getCommitmentInFromDisclosureProof,
  getCommitmentInFromIDDataProof,
  getCommitmentInFromIntegrityProof,
  getCommitmentOutFromIDDataProof,
  getCommitmentOutFromIntegrityProof,
  getDiscloseCircuitInputs,
  getDiscloseParameterCommitment,
  getDisclosedBytesFromMrzAndMask,
  getAgeParameterCommitment,
  getMerkleRootFromDSCProof,
  getOuterCircuitInputs,
  getParameterCommitmentFromDisclosureProof,
} from "./circuits/node_modules/@zkpassport/utils"
import { AlgorithmIdentifier } from "./circuits/node_modules/@peculiar/asn1-x509"
import { id_sha256WithRSAEncryption } from "./circuits/node_modules/@peculiar/asn1-rsa"
import { Circuit } from "./circuits/src/ts/circuits"
import { generateSigningCertificates, loadKeypairFromFile, signSod } from "./circuits/src/ts/passport-generator"
import { generateSod, wrapSodInContentInfo } from "./circuits/src/ts/sod-generator"
import { TestHelper, convertPemToPackagedCertificateV1 } from "./circuits/src/ts/test-helper"
import { serializeAsn } from "./circuits/src/ts/utils"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`)
}
const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args)
const hex = (v: bigint) => `0x${v.toString(16).padStart(64, "0")}`

const FIXTURE_OUT = process.env.FIXTURE_OUT as string
if (!FIXTURE_OUT) throw new Error("Set FIXTURE_OUT to the output JSON path")

const FIXTURE_KIND = (process.env.FIXTURE_KIND ?? "disclose") as "disclose" | "age"
if (FIXTURE_KIND !== "disclose" && FIXTURE_KIND !== "age") {
  throw new Error(`FIXTURE_KIND must be 'disclose' or 'age', got '${FIXTURE_KIND}'`)
}

const AGE_MIN = 18
const AGE_MAX = 0 // 0 == "no upper bound" per the compare_age circuit

const FIXTURES_PATH = path.join(__dirname, "circuits/src/ts/tests/fixtures")
const DSC_KEYPAIR_PATH = path.join(FIXTURES_PATH, "dsc-keypair-rsa.json")

// Max padded byte length of the certificate TBS ("to be signed", RFC 5280 s4.1.2) section the
// sig-check circuits accept. Selects the circuit size variant (the submodule ships tbs_700 /
// 1000 / 1200 / 1600 under circuits/src/noir/bin/sig-check/); 700 fits the synthetic test
// certs, same as the circuits repo's own suite.
const MAX_TBS_LENGTH = 700

// The proof's embedded "now" (its `current_date` public input).
// At the moment TXE can't timewarp into the past, only into the future. So this timestamp is
// deliberately future-dated (2050-01-01). That way downstream consumers that enforce freshness
// can be tested.
const nowTimestamp = Number(process.env.FIXTURE_NOW ?? 2524608000) // 2050-01-01T00:00:00Z

// Blinding salts for the integrity -> disclosure commitment chain: both stages must hash the
// carried passport data with the same salts. Any fixed value works for a deterministic
// capture; 3n matches the circuits repo's own test suite.
const INTEGRITY_TO_DISCLOSURE_SALTS: IntegrityToDisclosureSalts = {
  dg1Salt: 3n,
  expiryDateSalt: 3n,
  dg2HashSalt: 3n,
  privateNullifierSalt: 3n,
}

type Subproof = {
  proof: string[]
  publicInputs: string[]
  vkey: string[]
  vkeyHash: string
  paramCommitment?: bigint
}

async function proveSubproof(
  circuitName: string,
  inputs: unknown,
): Promise<{ circuit: Circuit; proof: { proof: string[]; publicInputs: string[] }; vkey: string[]; vkeyHash: string }> {
  const circuit = Circuit.from(circuitName)

  log(`proving ${circuitName} ...`)
  const proof = await circuit.prove(inputs as any, {
    recursive: true,
    useCli: true,
    circuitName,
  })

  assert(!!proof, `${circuitName} proof defined`)

  const vkey = (await circuit.getVerificationKey({ evm: false })).vkeyFields
  const vkeyHash = `0x${(await poseidon2HashAsync(vkey.map((x) => BigInt(x)))).toString(16).padStart(64, "0")}`

  log(`${circuitName}: proof=${proof.proof.length} fields, publicInputs=${proof.publicInputs.length}, vk=${vkey.length} fields, vkHash=${vkeyHash}`)
  return { circuit, proof, vkey, vkeyHash }
}

type DisclosureStage = {
  name: string
  subproof: Subproof
  extras: Record<string, unknown>
}

// 4th subproof: the parameterised disclosure stage.
async function proveDisclosureStage(
  helper: TestHelper,
  integrityToDisclosureCommitment: bigint,
): Promise<DisclosureStage> {
  const name = "disclose_bytes"

  const discloseQuery: Query = {
    issuing_country: { disclose: true },
    nationality: { disclose: true },
    document_type: { disclose: true },
    document_number: { disclose: true },
    fullname: { disclose: true },
    birthdate: { disclose: true },
    expiry_date: { disclose: true },
    gender: { disclose: true },
  }

  const discloseInputs = await getDiscloseCircuitInputs(
    helper.passport as any,
    discloseQuery,
    INTEGRITY_TO_DISCLOSURE_SALTS,
    0n,
    0n,
    0n,
    nowTimestamp,
  )
  assert(!!discloseInputs, "disclose inputs generated")

  const discloseMask: number[] = discloseInputs!.disclose_mask
  const disclosedBytes: number[] = getDisclosedBytesFromMrzAndMask(
    (helper.passport as any).mrz,
    discloseMask,
  )
  assert(discloseMask.length === 90, `disclose_mask length == 90 (got ${discloseMask.length})`)
  assert(disclosedBytes.length === 90, `disclosedBytes length == 90 (got ${disclosedBytes.length})`)

  const discloseR = await proveSubproof(name, discloseInputs)
  const paramCommitment = getParameterCommitmentFromDisclosureProof(discloseR.proof)

  // Cross-stack check: the mask/bytes we emit must reproduce the proof's commitment.
  const recomputed = await getDiscloseParameterCommitment(discloseMask, disclosedBytes)
  assert(recomputed === paramCommitment, "emitted mask/bytes reproduce the disclose param commitment")

  const commitmentIn = getCommitmentInFromDisclosureProof(discloseR.proof)
  assert(commitmentIn === integrityToDisclosureCommitment, "disclose commitment_in == integrity commitment_out")

  await discloseR.circuit.destroy()

  return {
    name,
    subproof: {
      proof: discloseR.proof.proof,
      publicInputs: discloseR.proof.publicInputs,
      vkey: discloseR.vkey,
      vkeyHash: discloseR.vkeyHash,
      paramCommitment,
    },
    extras: {
      discloseParamCommitment: hex(paramCommitment),
      discloseMask,
      disclosedBytes,
    },
  }
}

// 4th subproof, age variant: an 18+ compare_age check instead of a byte disclosure.
async function proveAgeStage(
  helper: TestHelper,
  integrityToDisclosureCommitment: bigint,
): Promise<DisclosureStage> {
  const name = "compare_age"

  const ageQuery: Query = { age: { gte: AGE_MIN } }
  const ageInputs = await getAgeCircuitInputs(
    helper.passport as any,
    ageQuery,
    INTEGRITY_TO_DISCLOSURE_SALTS,
    0n,
    0n,
    0n,
    nowTimestamp,
  )
  assert(!!ageInputs, "age inputs generated")

  const minAge = Number(ageInputs.min_age_required)
  const maxAge = Number(ageInputs.max_age_required)
  assert(minAge === AGE_MIN, `min_age_required == ${AGE_MIN} (got ${minAge})`)
  assert(maxAge === AGE_MAX, `max_age_required == ${AGE_MAX} (got ${maxAge})`)

  const ageR = await proveSubproof(name, ageInputs)
  const paramCommitment = getParameterCommitmentFromDisclosureProof(ageR.proof)

  const recomputed = await getAgeParameterCommitment(minAge, maxAge)
  assert(recomputed === paramCommitment, "emitted min/max age reproduce the age param commitment")

  const commitmentIn = getCommitmentInFromDisclosureProof(ageR.proof)
  assert(commitmentIn === integrityToDisclosureCommitment, "age commitment_in == integrity commitment_out")

  await ageR.circuit.destroy()

  return {
    name,
    subproof: {
      proof: ageR.proof.proof,
      publicInputs: ageR.proof.publicInputs,
      vkey: ageR.vkey,
      vkeyHash: ageR.vkeyHash,
      paramCommitment,
    },
    extras: {
      ageParamCommitment: hex(paramCommitment),
      ageMinAge: minAge,
      ageMaxAge: maxAge,
    },
  }
}

async function main() {
  const bbVersion = execSync("bb --version").toString().trim().split("\n").pop()
  log(`bb on PATH: ${bbVersion}, FIXTURE_KIND=${FIXTURE_KIND}`)

  // ---- Passport + certificate setup (verbatim from outer.test.ts beforeEach) ----
  const helper = new TestHelper()
  const packagedCerts: PackagedCertificatesFile = {
    version: 1,
    timestamp: 0,
    root: "",
    certificates: [],
    masterlists: [],
    revocations: [],
  }

  // Johnny Silverhand's MRZ
  const mrz =
    "P<AUSSILVERHAND<<JOHNNY<<<<<<<<<<<<<<<<<<<<<PA1234567_AUS881112_M600101_<CYBERCITY<<<<\0\0"
  const dg1 = Binary.fromHex("615B5F1F58").concat(Binary.from(mrz))
  const dscKeypair = await loadKeypairFromFile(DSC_KEYPAIR_PATH)
  const { cscPem, dsc, dscKeys } = await generateSigningCertificates({
    cscSigningHashAlgorithm: "SHA-512",
    cscKeyType: "RSA",
    cscKeySize: 4096,
    dscSigningHashAlgorithm: "SHA-256",
    dscKeyType: "RSA",
    dscKeySize: 2048,
    dscKeypair,
  })

  const { sod } = await generateSod(dg1, [dsc], "SHA-256", new AlgorithmIdentifier({
    algorithm: id_sha256WithRSAEncryption,
  }))

  const { sod: signedSod } = await signSod(sod, dscKeys, "SHA-256")

  packagedCerts.certificates.push(await convertPemToPackagedCertificateV1(cscPem))
  packagedCerts.timestamp = Math.floor(Date.UTC(2026, 0, 1) / 1000)
  packagedCerts.root = await calculatePackagedCertificatesRoot(packagedCerts)

  const contentInfoWrappedSod = serializeAsn(wrapSodInContentInfo(signedSod))

  await helper.loadPassport(dg1, Binary.from(contentInfoWrappedSod))
  helper.setCertificates(packagedCerts)

  // ---- Subproof chain: DSC -> ID data -> integrity -> <disclosure> ----
  const subproofs: Map<number, Subproof> = new Map()

  const dscName = `sig_check_dsc_tbs_${MAX_TBS_LENGTH}_rsa_pkcs_4096_sha512`
  const dscInputs = await helper.generateCircuitInputs("dsc")
  const dscR = await proveSubproof(dscName, dscInputs)
  assert(dscR.proof.publicInputs.length === 2, "dsc publicInputs length == 2")

  const certificateRegistryRoot = getMerkleRootFromDSCProof(dscR.proof)
  const cscToDscCommitment = getCommitmentFromDSCProof(dscR.proof)
  subproofs.set(0, { proof: dscR.proof.proof, publicInputs: dscR.proof.publicInputs, vkey: dscR.vkey, vkeyHash: dscR.vkeyHash })
  await dscR.circuit.destroy()

  const idName = `sig_check_id_data_tbs_${MAX_TBS_LENGTH}_rsa_pkcs_2048_sha256`
  const idInputs = await helper.generateCircuitInputs("id")
  const idR = await proveSubproof(idName, idInputs)
  const idDataCommitmentIn = getCommitmentInFromIDDataProof(idR.proof)
  const dscToIdDataCommitment = getCommitmentOutFromIDDataProof(idR.proof)
  assert(idDataCommitmentIn === cscToDscCommitment, "id commitment_in == dsc commitment_out")
  subproofs.set(1, { proof: idR.proof.proof, publicInputs: idR.proof.publicInputs, vkey: idR.vkey, vkeyHash: idR.vkeyHash })
  await idR.circuit.destroy()

  const integrityName = "data_check_integrity_sa_sha256_dg_sha256"
  const integrityInputs = await helper.generateCircuitInputs("integrity", nowTimestamp)
  const integrityR = await proveSubproof(integrityName, integrityInputs)
  const integrityCommitmentIn = getCommitmentInFromIntegrityProof(integrityR.proof)
  const integrityToDisclosureCommitment = getCommitmentOutFromIntegrityProof(integrityR.proof)
  assert(integrityCommitmentIn === dscToIdDataCommitment, "integrity commitment_in == id commitment_out")
  subproofs.set(2, { proof: integrityR.proof.proof, publicInputs: integrityR.proof.publicInputs, vkey: integrityR.vkey, vkeyHash: integrityR.vkeyHash })
  await integrityR.circuit.destroy()

  const disclosure = FIXTURE_KIND === "disclose"
    ? await proveDisclosureStage(helper, integrityToDisclosureCommitment)
    : await proveAgeStage(helper, integrityToDisclosureCommitment)
  subproofs.set(3, disclosure.subproof)

  // ---- Local circuit manifest (registry tree over our 4 local vkey hashes) ----
  // The 4th leaf is whichever disclosure circuit this variant used, otherwise the outer
  // circuit's membership proof for it would not verify.
  const localManifest: any = {
    version: `local-harness-${FIXTURE_KIND}`,
    root: "",
    circuits: {
      [dscName]: { hash: subproofs.get(0)!.vkeyHash },
      [idName]: { hash: subproofs.get(1)!.vkeyHash },
      [integrityName]: { hash: subproofs.get(2)!.vkeyHash },
      [disclosure.name]: { hash: subproofs.get(3)!.vkeyHash },
    },
  }

  const mp0 = await getCircuitMerkleProof(subproofs.get(0)!.vkeyHash, localManifest)
  localManifest.root = mp0.root
  const mp1 = await getCircuitMerkleProof(subproofs.get(1)!.vkeyHash, localManifest)
  const mp2 = await getCircuitMerkleProof(subproofs.get(2)!.vkeyHash, localManifest)
  const mp3 = await getCircuitMerkleProof(subproofs.get(3)!.vkeyHash, localManifest)
  log(`local circuit registry root: ${localManifest.root}`)

  // ---- Outer proof ----
  const outerInputs = await getOuterCircuitInputs(
    { ...toSubproofInput(subproofs.get(0)!, mp0) },
    { ...toSubproofInput(subproofs.get(1)!, mp1) },
    { ...toSubproofInput(subproofs.get(2)!, mp2) },
    [{ ...toSubproofInput(subproofs.get(3)!, mp3) }],
    localManifest.root,
  )

  const outerCircuit = Circuit.from("outer_count_4")
  log("proving outer_count_4 ...")

  const outerProof = await outerCircuit.prove(outerInputs, {
    useCli: true,
    circuitName: "outer_count_4",
    recursive: true,
  })
  const outerVkey = (await outerCircuit.getVerificationKey({ evm: false })).vkeyFields
  const outerVkeyHashPoseidon = `0x${(await poseidon2HashAsync(outerVkey.map((x) => BigInt(x)))).toString(16).padStart(64, "0")}`
  await outerCircuit.destroy()

  // bb's own vk_hash for outer_count_4 (this is what verify_proof_with_type checks against)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "outer-vk-"))
  execSync(`bb write_vk -t noir-recursive -b target/outer_count_4.json -o ${tmp}`)
  const outerVkeyHashBB = `0x${fs.readFileSync(path.join(tmp, "vk_hash")).toString("hex")}`
  fs.rmSync(tmp, { recursive: true, force: true })

  log(`outer proof: ${outerProof.proof.length} fields, publicInputs: ${outerProof.publicInputs.length}`)
  log(`outer vk: ${outerVkey.length} fields, poseidon2(vk)=${outerVkeyHashPoseidon}, bb vk_hash=${outerVkeyHashBB}`)

  const paramCommitment = subproofs.get(3)!.paramCommitment
  assert(paramCommitment !== undefined, "disclosure param commitment present")

  // The outer proof's public inputs are [certRoot, circuitRoot, currentDate, scope, subscope,
  // paramCommitment..., nullifierType, scopedNullifier, oprfPkHash] -- slot 5 for count_4.
  assert(
    BigInt(outerProof.publicInputs[5]) === paramCommitment,
    "outer publicInputs[5] == disclosure param commitment",
  )

  const fixture = {
    generator: "test-harness/generate-proof-fixtures.ts (zkpassport-aztec)",
    kind: FIXTURE_KIND,
    disclosureCircuit: disclosure.name,
    bbVersion,
    // cwd is the circuits submodule (set by generate-proof-fixtures.sh), so this records the
    // circuits commit the proof was built from; fixture-conformance.test.ts holds it to the pin.
    circuitsCommit: execSync("git rev-parse HEAD").toString().trim(),
    circuit: "outer_count_4",
    nowTimestamp,
    certificateRegistryRoot: hex(certificateRegistryRoot),
    circuitRegistryRoot: localManifest.root,
    paramCommitment: hex(paramCommitment!),
    ...disclosure.extras,
    vkeyFields: outerVkey,
    vkeyHashPoseidon2: outerVkeyHashPoseidon,
    vkeyHashBB: outerVkeyHashBB,
    proof: outerProof.proof,
    publicInputs: outerProof.publicInputs,
  }
  fs.mkdirSync(path.dirname(FIXTURE_OUT), { recursive: true })
  fs.writeFileSync(FIXTURE_OUT, JSON.stringify(fixture, null, 2))
  log(`fixture written to ${FIXTURE_OUT}`)

  // The age fixture also becomes the Noir-side source of truth for consumers' TXE tests
  // (the disclose fixture is consumed by test-recursive-verification.sh straight from the JSON).
  if (FIXTURE_KIND === "age") {
    const proofNr = new URL(
      "../zkpassport.nr/zkpassport_core/src/fixtures/proof.nr",
      import.meta.url,
    ).pathname
    emitProofGlobals(fixture, proofNr)
    log(`proof globals written to ${proofNr} -- run aztec-nargo fmt over zkpassport.nr`)
  }
}

function toSubproofInput(
  s: Subproof,
  mp: { root: string; index: number; path: string[] },
) {
  return {
    proof: s.proof,
    publicInputs: s.publicInputs,
    vkey: s.vkey,
    keyHash: s.vkeyHash,
    treeHashPath: mp.path,
    treeIndex: mp.index.toString(),
  }
}

// Emits zkpassport_core/src/fixtures/proof.nr, replacing it wholesale.
function emitProofGlobals(
  fx: {
    vkeyFields: string[]
    proof: string[]
    publicInputs: string[]
    certificateRegistryRoot: string
    circuitRegistryRoot: string
    vkeyHashBB: string
    nowTimestamp: number
  },
  outPath: string,
) {
  const blob = [...fx.vkeyFields, ...fx.proof, ...fx.publicInputs] // capsule layout: vk ‖ proof ‖ PIs
  const arr = (name: string, values: string[]) =>
    `pub global ${name}: [Field; ${values.length}] = [\n    ${values.join(",\n    ")},\n];\n`
  fs.writeFileSync(
    outPath,
    "//! Proof-fixture globals: a real outer_count_4 proof (vk ‖ proof ‖ public inputs) plus the\n" +
      "//! registry roots, vk hash, and timestamp it was produced under, for consumers' TXE tests.\n" +
      "//! Source of truth on the Noir side; fixture-conformance.test.ts checks the checked-in age\n" +
      "//! fixture JSON agrees. Regenerated by test-harness/generate-proof-fixtures.sh on a capture.\n" +
      arr("AGE_FIXTURE_BLOB", blob) +
      `pub global AGE_FIXTURE_CERT_ROOT: Field = ${fx.certificateRegistryRoot};\n` +
      `pub global AGE_FIXTURE_CIRCUIT_ROOT: Field = ${fx.circuitRegistryRoot};\n` +
      `pub global AGE_FIXTURE_VK_HASH: Field = ${fx.vkeyHashBB};\n` +
      `pub global AGE_FIXTURE_CURRENT_DATE: u64 = ${fx.nowTimestamp};\n`,
  )
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
