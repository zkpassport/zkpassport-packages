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
  getECDSAInfo,
  getIDDataCircuitInputs,
  getIntegrityCheckCircuitInputs,
  getRSAInfo,
  getSanctionsExclusionCheckCircuitInputs,
  getServiceScopeHash,
  getServiceSubscopeHash,
  getSodSignatureAlgorithmHashAlgorithm,
  getSodSignatureAlgorithmType,
  getTBSMaxLen,
  poseidon2,
  SanctionsBuilder,
  TargetExistsError,
  type PackagedCertificate,
  type PackagedCertificatesFile,
  type PassportViewModel,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"

const SALT = BigInt("0x" + "11".repeat(31))

type ProofStep = { name: string; inputs: object; committedInputs?: unknown }

export async function proveFastMode({
  passport,
  query,
  domain,
  scope,
  circuitVersion,
  registry,
  certificates,
}: {
  passport: PassportViewModel
  query: Query
  domain: string
  scope?: string
  circuitVersion: string
  registry: RegistryClient
  /** Packaged certificates to prove against instead of those for the registry's latest root */
  certificates?: PackagedCertificatesFile
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

  const packagedCerts = certificates ?? (await registry.getCertificates())
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
      ).catch(toSanctionsCheckFailed),
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

/** The passport is on a sanctions list, so no exclusion proof exists for it */
export class SanctionsCheckFailedError extends Error {}

/** The sanctions tree published for the latest sanctions root of the registry's chain */
async function getSanctionsBuilder(registry: RegistryClient): Promise<SanctionsBuilder> {
  const { serialised } = await registry.getSanctionsTree()
  return new SanctionsBuilder(await AsyncOrderedMT.fromSerialized(serialised, poseidon2))
}

/** A failed exclusion proof read the way the app's circuit-matcher.ts reads it */
function toSanctionsCheckFailed(error: unknown): never {
  if (error instanceof TargetExistsError) {
    throw new SanctionsCheckFailedError()
  }
  throw error
}

/** A curve as circuit names spell it, the way the app's circuit-matcher.ts does: nist_p256 */
function curveId(curve: string): string {
  const family = curve.includes("brainpool") ? "brainpool" : "nist"
  const name = curve.replace("brainpoolP", "").replace("nist", "").replace("-", "").toLowerCase()
  return `${family}_${name}`
}

/** Inputs from a @zkpassport/utils builder, which returns null or undefined when it cannot build them */
function required<T extends object>(inputs: T | null | undefined, circuitName: string): T {
  if (!inputs) {
    throw new Error(`Could not build the inputs of ${circuitName}`)
  }
  return inputs
}

/** What the app's getPassportFieldsFromQuery() reports for a query this headless app proves */
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
  const cscaKey =
    csca.public_key.type === "EC"
      ? `ecdsa_${curveId(csca.public_key.curve)}`
      : `rsa_${csca.signature_algorithm === "RSA-PSS" ? "pss" : "pkcs"}_${getBitSize(BigInt(csca.public_key.modulus))}`
  const dsc = `sig_check_dsc_tbs_${tbsMaxLen}_${cscaKey}_${getDSCSignatureAlgorithmHashAlgorithm(passport)}`

  const tbs = extractTBS(passport)
  if (!tbs) {
    throw new Error("Could not extract the DSC TBS")
  }
  const idScheme = passport.sod.signerInfo.signatureAlgorithm.name.toLowerCase().includes("pss")
    ? "pss"
    : "pkcs"
  const dscKey =
    getSodSignatureAlgorithmType(passport) === "ECDSA"
      ? `ecdsa_${curveId(getECDSAInfo(tbs.subjectPublicKeyInfo).curve)}`
      : `rsa_${idScheme}_${getBitSize(getRSAInfo(tbs.subjectPublicKeyInfo).modulus)}`
  const idData = `sig_check_id_data_tbs_${tbsMaxLen}_${dscKey}_${getSodSignatureAlgorithmHashAlgorithm(passport)}`

  const saHash = passport.sod.signerInfo.digestAlgorithm.toLowerCase().replace("-", "")
  const dgHash = passport.sod.encapContentInfo.eContent.hashAlgorithm.toLowerCase().replace("-", "")
  const integrity = `data_check_integrity_sa_${saHash}_dg_${dgHash}`
  return { dsc, idData, integrity }
}
