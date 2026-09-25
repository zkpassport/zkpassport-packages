// Circuit inputs come back from the @zkpassport/utils builders as untyped JSON
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from "node:crypto"
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js"
import { Noir } from "@noir-lang/noir_js"
import type { RegistryClient } from "@zkpassport/registry"
import {
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

// The app derives a 31-byte salt from its keychain master key; any fixed one will do here.
// Its hex form must have even length, since getPublicSalt hex-decodes salt.toString(16).
const SALT = BigInt("0x" + "11".repeat(31))

const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex")

// --- Copied from zkpassport-mobile-app src/lib/index.ts ---
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

// --- Copied from zkpassport-mobile-app src/lib/circuit-matcher.ts, RSA PKCS branch only ---
async function getBaseCircuitNames(passport: PassportViewModel, certificates: any[]) {
  const tbsMaxLen = getTBSMaxLen(passport)
  const csca = await getCscaForPassportAsync(passport.sod.certificate, certificates)
  if (!csca) throw new Error("No CSCA found for the passport's DSC in the certificate registry")
  if (!csca.signature_algorithm.toLowerCase().includes("rsa")) {
    throw new Error("Only RSA CSCAs are handled so far")
  }
  const cscaBits = getBitSize(BigInt((csca.public_key as any).modulus))
  const cscaScheme = csca.signature_algorithm === "RSA-PSS" ? "pss" : "pkcs"
  const dsc = `sig_check_dsc_tbs_${tbsMaxLen}_rsa_${cscaScheme}_${cscaBits}_${getDSCSignatureAlgorithmHashAlgorithm(passport)}`

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
  return { dsc, idData, integrity }
}

export type ProvedRequest = { proofs: ProofResult[]; queryResult: QueryResult }

/**
 * Make the fast-mode proofs for a request, the way the app does: 3 base proofs (DSC, ID data,
 * integrity) then the disclosure proofs, each shaped as the ProofResult the app sends over the
 * bridge. Only { age: { gte }, nationality: { disclose } } is handled so far; the app's
 * getDisclosureCircuits() covers the rest.
 */
export async function proveFastMode({
  passport,
  query,
  domain,
  scope,
  circuitVersion,
  registry,
  onProof,
}: {
  passport: PassportViewModel
  query: Query
  domain: string
  scope?: string
  circuitVersion: string
  registry: RegistryClient
  onProof?: (proof: ProofResult, timing: { witnessMs: number; proveMs: number }) => void
}): Promise<ProvedRequest> {
  const fields = Object.keys(query).sort().join(",")
  if (fields !== "age,nationality" || !query.age?.gte || !query.nationality?.disclose) {
    throw new Error(
      `Only age.gte + nationality.disclose is handled so far, got ${JSON.stringify(query)}`,
    )
  }
  const packagedCerts = await registry.getCertificates()
  const manifest = await registry.getCircuitManifest(undefined, { version: circuitVersion })
  const names = await getBaseCircuitNames(passport, packagedCerts.certificates)

  const salts = getIntegrityToDisclosureSalts(SALT)
  const serviceScope = getServiceScopeHash(domain)
  const serviceSubscope = getServiceSubscopeHash(scope as string)
  const now = Math.floor(Date.now() / 1000)

  // Committed inputs are keyed by circuit name, as in the app's DisclosureProofService
  const plan: { name: string; inputs: any; committed?: (inputs: any) => unknown }[] = [
    { name: names.dsc, inputs: await getDSCCircuitInputs(passport, SALT, packagedCerts) },
    { name: names.idData, inputs: await getIDDataCircuitInputs(passport, SALT, SALT) },
    { name: names.integrity, inputs: await getIntegrityCheckCircuitInputs(passport, SALT, salts) },
    {
      name: "compare_age",
      inputs: await getAgeCircuitInputs(
        passport,
        query,
        salts,
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
        query,
        salts,
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
      const result = {
        // Same layout as the app's generateProof(): [public inputs][proof body], hex, no 0x
        proof:
          publicInputs.map((x) => x.replace(/^0x/, "").padStart(64, "0")).join("") +
          Buffer.from(proof).toString("hex"),
        vkeyHash: circuit.vkey_hash,
        version: manifest.version as `${number}.${number}.${number}`,
        name: circuit.name,
        index,
        total: plan.length,
        ...(step.committed
          ? { committedInputs: { [circuit.name]: step.committed(step.inputs) } }
          : {}),
      } as ProofResult
      proofs.push(result)
      onProof?.(result, { witnessMs: t1 - t0, proveMs: t2 - t1 })
    }
  } finally {
    await bb.destroy()
  }

  // What the app's getPassportFieldsFromQuery() reports for this query
  const queryResult = {
    age: { gte: { expected: query.age.gte as number, result: true } },
    nationality: { disclose: { result: passport.nationality } },
  } as QueryResult
  return { proofs, queryResult }
}
