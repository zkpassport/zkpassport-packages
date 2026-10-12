import { createHash } from "node:crypto"
import { Barretenberg, UltraHonkBackend } from "@aztec/bb.js"
import { Noir, type CompiledCircuit, type InputMap } from "@noir-lang/noir_js"
import type { RegistryClient } from "@zkpassport/registry"
import {
  AsyncOrderedMT,
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
  getSanctionsExclusionCheckCircuitInputs,
  getServiceScopeHash,
  getServiceSubscopeHash,
  getSodSignatureAlgorithmHashAlgorithm,
  getTBSMaxLen,
  poseidon2,
  SanctionsBuilder,
  type PackagedCertificate,
  type PassportViewModel,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"

// The app derives a 31-byte salt from its keychain master key; any fixed one will do here.
// Its hex form must have even length, since getPublicSalt hex-decodes salt.toString(16).
const SALT = BigInt("0x" + "11".repeat(31))

type ProofStep = { name: string; inputs: object; committedInputs?: unknown }

/**
 * Make the fast-mode proofs for a request the way the app does: the DSC, ID data and integrity
 * proofs, then one disclosure proof per query field, each shaped as the ProofResult the app sends
 * over the bridge. Handles age.gte, nationality.disclose and sanctions.
 */
export async function proveFastMode({
  passport,
  query,
  domain,
  scope,
  circuitVersion,
  registry,
}: {
  passport: PassportViewModel
  query: Query
  domain: string
  scope?: string
  circuitVersion: string
  registry: RegistryClient
}): Promise<{ proofs: ProofResult[]; queryResult: QueryResult }> {
  const unhandled = Object.keys(query).filter(
    (field) => !["age", "nationality", "sanctions"].includes(field),
  )
  if (
    unhandled.length > 0 ||
    (query.age && !query.age.gte) ||
    (query.nationality && !query.nationality.disclose)
  ) {
    throw new Error(
      `Only age.gte, nationality.disclose and sanctions are handled, got ${JSON.stringify(query)}`,
    )
  }

  const packagedCerts = await registry.getCertificates()
  const manifest = await registry.getCircuitManifest(undefined, { version: circuitVersion })
  const names = await getBaseCircuitNames(passport, packagedCerts.certificates)

  const salts = getIntegrityToDisclosureSalts(SALT)
  const disclosureArgs = [
    salts,
    0n,
    getServiceScopeHash(domain),
    getServiceSubscopeHash(scope as string),
    Math.floor(Date.now() / 1000),
  ] as const

  const steps: ProofStep[] = [
    {
      name: names.dsc,
      inputs: required(await getDSCCircuitInputs(passport, SALT, packagedCerts), names.dsc),
    },
    {
      name: names.idData,
      inputs: required(await getIDDataCircuitInputs(passport, SALT, SALT), names.idData),
    },
    {
      name: names.integrity,
      inputs: required(
        await getIntegrityCheckCircuitInputs(passport, SALT, salts),
        names.integrity,
      ),
    },
  ]

  // Committed inputs as the app's DisclosureProofService records them
  if (query.age) {
    const inputs = required(
      await getAgeCircuitInputs(passport, query, ...disclosureArgs),
      "compare_age",
    )
    steps.push({
      name: "compare_age",
      inputs,
      committedInputs: { minAge: inputs.min_age_required, maxAge: inputs.max_age_required },
    })
  }
  if (query.nationality) {
    const inputs = required(
      await getDiscloseCircuitInputs(passport, query, ...disclosureArgs),
      "disclose_bytes",
    )
    const dg1 = inputs.salted_dg1.value as number[]
    steps.push({
      name: "disclose_bytes",
      inputs,
      committedInputs: {
        disclosedBytes: dg1.slice(5).map((byte, index) => byte * inputs.disclose_mask[index]),
        discloseMask: inputs.disclose_mask,
      },
    })
  }
  if (query.sanctions) {
    const inputs = required(
      await getSanctionsExclusionCheckCircuitInputs(
        passport,
        query.sanctions.strict ?? false,
        ...disclosureArgs,
        undefined,
        await getSanctionsBuilder(registry),
      ),
      "exclusion_check_sanctions",
    )
    steps.push({
      name: "exclusion_check_sanctions",
      inputs,
      committedInputs: { rootHash: inputs.root, isStrict: !!inputs.is_strict },
    })
  }

  const barretenberg = await Barretenberg.new()
  const proofs: ProofResult[] = []
  try {
    for (const [index, step] of steps.entries()) {
      const circuit = await registry.getPackagedCircuit(step.name, manifest)
      // Packaged circuits carry no debug symbols
      const noir = new Noir({
        bytecode: circuit.bytecode,
        abi: circuit.abi as CompiledCircuit["abi"],
        debug_symbols: "",
        file_map: {},
      })
      const { witness } = await noir.execute(step.inputs as InputMap)
      const { proof, publicInputs } = await new UltraHonkBackend(
        circuit.bytecode,
        barretenberg,
      ).generateProof(witness)

      proofs.push({
        // Same layout as the app's generateProof(): [public inputs][proof body], hex, no 0x
        proof:
          publicInputs.map((input) => input.replace(/^0x/, "").padStart(64, "0")).join("") +
          Buffer.from(proof).toString("hex"),
        vkeyHash: circuit.vkey_hash,
        version: manifest.version as ProofResult["version"],
        name: circuit.name,
        index,
        total: steps.length,
        ...(step.committedInputs
          ? { committedInputs: { [circuit.name]: step.committedInputs } }
          : {}),
      } as ProofResult)
    }
  } finally {
    await barretenberg.destroy()
  }

  return { proofs, queryResult: getQueryResult(passport, query) }
}

/** The sanctions tree published for the latest sanctions root of the registry's chain */
export async function getSanctionsBuilder(registry: RegistryClient): Promise<SanctionsBuilder> {
  const { serialised } = await registry.getSanctionsTree()
  return new SanctionsBuilder(await AsyncOrderedMT.fromSerialized(serialised, poseidon2))
}

/** Inputs from a @zkpassport/utils builder, which returns null or undefined when it cannot build them */
function required<T extends object>(inputs: T | null | undefined, circuitName: string): T {
  if (!inputs) {
    throw new Error(`Could not build the inputs of ${circuitName}`)
  }
  return inputs
}

/** What the app's getPassportFieldsFromQuery() reports for a query this stand-in proves */
function getQueryResult(passport: PassportViewModel, query: Query): QueryResult {
  const result: Record<string, unknown> = {}
  if (query.age) {
    result.age = { gte: { expected: query.age.gte as number, result: true } }
  }
  if (query.nationality) {
    result.nationality = { disclose: { result: passport.nationality } }
  }
  if (query.sanctions) {
    // Proving succeeded, so the passport is not on the lists
    const passed = { passed: true }
    result.sanctions = {
      passed: true,
      countries: { US: passed, GB: passed, EU: passed, CH: passed },
      lists: {
        US_OFAC_SDN: passed,
        CH_SECO_SANCTIONS: passed,
        EU_FSF_SANCTIONS: passed,
        GB_FCDO_SANCTIONS: passed,
      },
      isStrict: query.sanctions.strict ?? false,
    }
  }
  return result as QueryResult
}

// Copied from zkpassport-mobile-app src/lib/index.ts
function getPublicSalt(salt: bigint): bigint {
  const saltBytes = Buffer.from(salt.toString(16), "hex")
  return BigInt("0x" + createHash("sha256").update(saltBytes).digest("hex"))
}

// Copied from zkpassport-mobile-app src/lib/index.ts
function getIntegrityToDisclosureSalts(salt: bigint) {
  const publicSalt = getPublicSalt(salt)
  return {
    dg1Salt: salt,
    dg2HashSalt: publicSalt,
    expiryDateSalt: publicSalt,
    privateNullifierSalt: salt,
  }
}

/**
 * The DSC, ID data and integrity circuit names for a passport, as zkpassport-mobile-app's
 * getDSCCircuit, getIDDataCircuit and getIntegrityCheckCircuit build them; RSA PKCS only
 */
async function getBaseCircuitNames(
  passport: PassportViewModel,
  certificates: PackagedCertificate[],
) {
  const tbsMaxLen = getTBSMaxLen(passport)
  const csca = await getCscaForPassportAsync(passport.sod.certificate, certificates)
  if (!csca) {
    throw new Error("No CSCA found for the passport's DSC in the certificate registry")
  }
  if (csca.public_key.type !== "RSA") {
    throw new Error("Only RSA CSCAs are handled so far")
  }
  const cscaBits = getBitSize(BigInt(csca.public_key.modulus))
  const cscaScheme = csca.signature_algorithm === "RSA-PSS" ? "pss" : "pkcs"
  const dsc = `sig_check_dsc_tbs_${tbsMaxLen}_rsa_${cscaScheme}_${cscaBits}_${getDSCSignatureAlgorithmHashAlgorithm(passport)}`

  const tbs = extractTBS(passport)
  if (!tbs) {
    throw new Error("Could not extract the DSC TBS")
  }
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
