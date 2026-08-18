/**
 * zkpassport-aztec harness: generate a real ZKPassport `outer_count_4` proof fixture
 * for the bb-level golden-fixture harness (harness/run-harness.sh).
 *
 * Evolved from spike/spike-outer-fixture.ts (which was itself adapted from the circuits
 * repo's src/ts/tests/outer.test.ts "4 subproofs" test). Changes vs the spike:
 *   1. emits the disclose payload (`discloseMask` 0/1 x90, `disclosedBytes` u8 x90) so the
 *      Noir side can recompute the parameter commitment in-circuit;
 *   2. FIXTURE_KIND=disclose|age parameterises the 4th (disclosure) subproof:
 *      `disclose_bytes` vs `compare_age` (query { age: { gte: 18 } } -> minAge 18, maxAge 0);
 *   3. both variants emit the SAME core key set (vkeyFields/proof/publicInputs/vkeyHashBB/
 *      vkeyHashPoseidon2/certificateRegistryRoot/circuitRegistryRoot/nowTimestamp/
 *      paramCommitment) so downstream generators can consume either.
 *
 * The local circuit manifest is rebuilt from the LOCALLY generated vkey hashes (the committed
 * src/ts/tests/fixtures/circuit-manifest.json was produced by a different bb build), with the
 * disclosure circuit's own vkey hash as the 4th leaf -- so `compare_age` replaces
 * `disclose_bytes` in the manifest for the age variant, otherwise the outer circuit's
 * circuit-registry membership check fails.
 *
 * MUST run with cwd = the circuits repo (Circuit.from resolves `target/<name>.json` relative
 * to cwd) and with the 5.0.1 toolchain's bb first in PATH (bb 5.0.0-nightly matches
 * ZKPassport's production circuit builds). Because `npx tsx` resolves node_modules from the
 * SCRIPT's path, this file is copied into the circuits repo before running -- see
 * harness/gen-fixtures.sh, which does the copy/run/cleanup.
 *
 *   FIXTURE_KIND=disclose FIXTURE_OUT=/path/out.json npx tsx <copy-inside-circuits-repo>.ts
 */
import { execSync } from "child_process"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { poseidon2HashAsync } from "@zkpassport/poseidon2"
import type { IntegrityToDisclosureSalts, PackagedCertificatesFile, Query } from "@zkpassport/utils"
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
  getNowTimestamp,
  getOuterCircuitInputs,
  getParameterCommitmentFromDisclosureProof,
} from "@zkpassport/utils"
import { AlgorithmIdentifier } from "@peculiar/asn1-x509"
import { id_sha256WithRSAEncryption } from "@peculiar/asn1-rsa"
import { Circuit } from "./src/ts/circuits"
import { generateSigningCertificates, loadKeypairFromFile, signSod } from "./src/ts/passport-generator"
import { generateSod, wrapSodInContentInfo } from "./src/ts/sod-generator"
import { TestHelper, convertPemToPackagedCertificateV1 } from "./src/ts/test-helper"
import { serializeAsn } from "./src/ts/utils"

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

const FIXTURES_PATH = path.join(__dirname, "src/ts/tests/fixtures")
const DSC_KEYPAIR_PATH = path.join(FIXTURES_PATH, "dsc-keypair-rsa.json")
const MAX_TBS_LENGTH = 700

const nowTimestamp = getNowTimestamp()
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
    "P<AUSSILVERHAND<<JOHNNY<<<<<<<<<<<<<<<<<<<<<PA1234567_AUS881112_M300101_<CYBERCITY<<<<\0\0"
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

  // ---- 4th subproof: the parameterised disclosure stage ----
  let disclosureName: string
  let disclosureExtras: Record<string, unknown>

  if (FIXTURE_KIND === "disclose") {
    disclosureName = "disclose_bytes"
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

    const discloseR = await proveSubproof(disclosureName, discloseInputs)
    const paramCommitment = getParameterCommitmentFromDisclosureProof(discloseR.proof)
    // Cross-stack check: the mask/bytes we emit must reproduce the proof's commitment.
    const recomputed = await getDiscloseParameterCommitment(discloseMask, disclosedBytes)
    assert(recomputed === paramCommitment, "emitted mask/bytes reproduce the disclose param commitment")
    const commitmentIn = getCommitmentInFromDisclosureProof(discloseR.proof)
    assert(commitmentIn === integrityToDisclosureCommitment, "disclose commitment_in == integrity commitment_out")
    subproofs.set(3, {
      proof: discloseR.proof.proof,
      publicInputs: discloseR.proof.publicInputs,
      vkey: discloseR.vkey,
      vkeyHash: discloseR.vkeyHash,
      paramCommitment,
    })
    await discloseR.circuit.destroy()
    disclosureExtras = {
      discloseParamCommitment: hex(paramCommitment),
      discloseMask,
      disclosedBytes,
    }
  } else {
    disclosureName = "compare_age"
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

    const ageR = await proveSubproof(disclosureName, ageInputs)
    const paramCommitment = getParameterCommitmentFromDisclosureProof(ageR.proof)
    const recomputed = await getAgeParameterCommitment(minAge, maxAge)
    assert(recomputed === paramCommitment, "emitted min/max age reproduce the age param commitment")
    const commitmentIn = getCommitmentInFromDisclosureProof(ageR.proof)
    assert(commitmentIn === integrityToDisclosureCommitment, "age commitment_in == integrity commitment_out")
    subproofs.set(3, {
      proof: ageR.proof.proof,
      publicInputs: ageR.proof.publicInputs,
      vkey: ageR.vkey,
      vkeyHash: ageR.vkeyHash,
      paramCommitment,
    })
    await ageR.circuit.destroy()
    disclosureExtras = {
      ageParamCommitment: hex(paramCommitment),
      ageMinAge: minAge,
      ageMaxAge: maxAge,
    }
  }

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
      [disclosureName]: { hash: subproofs.get(3)!.vkeyHash },
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
    generator: "harness/fixture-gen.ts (zkpassport-aztec)",
    kind: FIXTURE_KIND,
    disclosureCircuit: disclosureName,
    bbVersion,
    circuit: "outer_count_4",
    nowTimestamp,
    certificateRegistryRoot: hex(certificateRegistryRoot),
    circuitRegistryRoot: localManifest.root,
    paramCommitment: hex(paramCommitment!),
    ...disclosureExtras,
    vkeyFields: outerVkey,
    vkeyHashPoseidon2: outerVkeyHashPoseidon,
    vkeyHashBB: outerVkeyHashBB,
    proof: outerProof.proof,
    publicInputs: outerProof.publicInputs,
  }
  fs.mkdirSync(path.dirname(FIXTURE_OUT), { recursive: true })
  fs.writeFileSync(FIXTURE_OUT, JSON.stringify(fixture, null, 2))
  log(`fixture written to ${FIXTURE_OUT}`)
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

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err)
    process.exit(1)
  },
)
