import { createHash } from "node:crypto"
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
  getOuterCircuitInputs,
  getOuterCircuitName,
  getOuterCircuitProof,
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
  type OuterCircuitProof,
  type PackagedCertificate,
  type PackagedCertificatesFile,
  type PackagedCircuit,
  type PassportViewModel,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"

const SALT = BigInt("0x" + "11".repeat(31))

type ProofStep = { name: string; inputs: object; committedInputs?: unknown }

type Prover = {
  prove: (
    bytecode: string,
    witness: Uint8Array,
  ) => Promise<{ proof: Uint8Array; publicInputs: string[] }>
  destroy: () => Promise<void>
}

export type ProvingOverrides = {
  /** Packaged certificates to prove against instead of those for the registry's latest root */
  certificates?: PackagedCertificatesFile
}

/**
 * Prove the DSC, ID data and integrity subproofs, then the disclosure proofs of `query`, which every
 * proof mode starts from
 */
export async function proveSubproofs({
  passport,
  query,
  domain,
  scope,
  circuitVersion,
  registry,
  overrides = {},
}: {
  passport: PassportViewModel
  query: Query
  domain: string
  scope?: string
  circuitVersion: string
  registry: RegistryClient
  overrides?: ProvingOverrides
}): Promise<{ subproofs: ProofResult[]; queryResult: QueryResult }> {
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

  const packagedCerts = overrides.certificates ?? (await registry.getCertificates())
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

  let prover: Prover | undefined
  const subproofs: ProofResult[] = []
  try {
    for (const [index, step] of steps.entries()) {
      const circuit = await registry.getPackagedCircuit(step.name, manifest)
      prover ??= await startProver(circuit.bb_version)

      subproofs.push({
        proof: await proveCircuit(prover, circuit, step.inputs),
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
    await prover?.destroy()
  }

  return { subproofs, queryResult: getQueryResult(passport, query) }
}

/**
 * Compress the subproofs into one outer proof, as the app does in compressed mode with its cloud
 * prover
 */
export async function proveOuterProof({
  subproofs,
  circuitVersion,
  registry,
}: {
  /** The DSC, ID data and integrity proofs, then the disclosure proofs */
  subproofs: ProofResult[]
  circuitVersion: string
  registry: RegistryClient
}): Promise<ProofResult> {
  const manifest = await registry.getCircuitManifest(undefined, { version: circuitVersion })
  const outerCircuitProofs: OuterCircuitProof[] = []
  for (const subproof of subproofs) {
    const circuit = await registry.getPackagedCircuit(subproof.name as string, manifest)
    outerCircuitProofs.push(await getOuterCircuitProof(subproof, circuit, manifest))
  }
  const [dsc, idData, integrity, ...disclosures] = outerCircuitProofs
  const inputs = getOuterCircuitInputs(dsc, idData, integrity, disclosures, manifest.root)

  const circuit = await registry.getPackagedCircuit(
    getOuterCircuitName(disclosures.length),
    manifest,
  )
  const prover = await startProver(circuit.bb_version)
  try {
    return {
      proof: await proveCircuit(prover, circuit, inputs),
      vkeyHash: circuit.vkey_hash,
      version: manifest.version as ProofResult["version"],
      name: circuit.name,
      index: 0,
      total: 1,
      committedInputs: subproofs.reduce<ProofResult["committedInputs"]>(
        (committedInputs, subproof) => ({ ...committedInputs, ...subproof.committedInputs }),
        {},
      ),
    }
  } finally {
    await prover.destroy()
  }
}

/** The passport is on a sanctions list, so no exclusion proof exists for it */
export class SanctionsCheckFailedError extends Error {}

/**
 * Prove `circuit` on `inputs`, in the layout of the app's generateProof(): the public inputs, then
 * the proof, in hex without 0x
 */
async function proveCircuit(
  prover: Prover,
  circuit: PackagedCircuit,
  inputs: object,
): Promise<string> {
  // Packaged circuits carry no debug symbols
  const noir = new Noir({
    bytecode: circuit.bytecode,
    abi: circuit.abi as CompiledCircuit["abi"],
    debug_symbols: "",
    file_map: {},
  })
  const { witness } = await noir.execute(inputs as InputMap)
  const { proof, publicInputs } = await prover.prove(circuit.bytecode, witness)

  return (
    publicInputs.map((input) => input.replace(/^0x/, "").padStart(64, "0")).join("") +
    Buffer.from(proof).toString("hex")
  )
}

/** Start a prover on the bb.js release for `bbVersion` */
async function startProver(bbVersion: string): Promise<Prover> {
  if (bbVersion === "5.0.0") {
    const { Barretenberg, UltraHonkBackend } = await import("@aztec/bb.js")
    const barretenberg = await startBarretenberg(() => Barretenberg.new())
    return {
      prove: (bytecode, witness) =>
        new UltraHonkBackend(bytecode, barretenberg).generateProof(witness),
      destroy: () => barretenberg.destroy(),
    }
  }

  if (bbVersion === "6.0.0") {
    const { Barretenberg, UltraHonkBackend } = await import("@aztec-foundation/bb.js")
    const barretenberg = await startBarretenberg(() => Barretenberg.new())
    return {
      prove: (bytecode, witness) =>
        new UltraHonkBackend(bytecode, barretenberg).generateProof(witness),
      destroy: () => barretenberg.destroy(),
    }
  }

  throw new Error(`No bb.js for circuits packaged with bb ${bbVersion}`)
}

/**
 * A Barretenberg whose native prover accepted its connection. bb.js gives the prover 5 seconds to
 * start, which a slow CI runner's first start can miss, and reports the miss only at the first call,
 * so connect here and start again on that timeout.
 */
async function startBarretenberg<
  T extends {
    blake2s: (input: { data: Uint8Array }) => Promise<unknown>
    destroy: () => Promise<void>
  },
>(create: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const barretenberg = await create()
    try {
      await barretenberg.blake2s({ data: new Uint8Array() })
      return barretenberg
    } catch (error) {
      await barretenberg.destroy().catch(() => {})
      if (attempt >= attempts || !/Timeout (waiting for bb|connecting to bb)/.test(String(error))) {
        throw error
      }
    }
  }
}

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
