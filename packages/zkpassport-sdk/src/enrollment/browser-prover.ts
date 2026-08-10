import {
  buildQueryResultFromWitness,
  getAgeCircuitInputsFromWitness,
  getBindCircuitInputsFromWitness,
  getBirthdateCircuitInputsFromWitness,
  getCommittedInputsForCircuit,
  getDiscloseCircuitInputsFromWitness,
  getExpiryDateCircuitInputsFromWitness,
  getIntegrityToDisclosureSalts,
  getIssuingCountryExclusionCircuitInputsFromWitness,
  getIssuingCountryInclusionCircuitInputsFromWitness,
  getNationalityExclusionCircuitInputsFromWitness,
  getNationalityInclusionCircuitInputsFromWitness,
  getNumberOfPublicInputs,
  getProofData,
  getRequiredDisclosureCircuitNames,
  getSanctionsExclusionCheckCircuitInputsFromWitness,
  getServiceScopeHash,
  getServiceSubscopeHash,
  getNowTimestamp,
  type DisclosureCircuitName,
  type DisclosureWitness,
  type EnrollmentBundle,
  type IntegrityToDisclosureSalts,
  type ProofResult,
  type Query,
  type QueryResult,
} from "@zkpassport/utils"
import { getBBVersionForCircuitVersion } from "../bb-verifier"
import {
  getManifestCached,
  getPackagedCircuitCached,
  getProvingModules,
  getSharedBarretenberg,
  isCertificateRootValidCached,
  isCircuitRootValidCached,
} from "./prover-cache"

/**
 * Thrown when the stored enrollment can no longer produce verifiable proofs
 * (circuit or certificate registry root rotated, circuit version too old).
 * Callers should delete the enrollment and fall back to the QR flow.
 */
export class EnrollmentStaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EnrollmentStaleError"
  }
}

/**
 * Thrown when the query requires circuits that cannot be proven in the browser
 * (e.g. facematch, which needs a live selfie and platform attestation).
 */
export class UnsupportedQueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "UnsupportedQueryError"
  }
}

/**
 * Disclosure circuits that can be proven locally in the browser.
 * Facematch is excluded (live selfie + platform attestation), and EVM variants
 * are excluded since compressed/EVM mode falls back to the mobile flow.
 */
export const SUPPORTED_LOCAL_CIRCUITS: readonly DisclosureCircuitName[] = [
  "disclose_bytes",
  "compare_age",
  "compare_birthdate",
  "compare_expiry",
  "inclusion_check_nationality",
  "exclusion_check_nationality",
  "inclusion_check_issuing_country",
  "exclusion_check_issuing_country",
  "bind",
  "exclusion_check_sanctions",
]

/**
 * Whether all circuits required by the query can be proven locally.
 */
export function isQueryLocallyProvable(query: Query): boolean {
  return getRequiredDisclosureCircuitNames(query).every((name) =>
    SUPPORTED_LOCAL_CIRCUITS.includes(name),
  )
}

export type LocalProofProgress = {
  current: number
  total: number
  circuit: string
}

type CircuitInputBuilder = (
  witness: DisclosureWitness,
  query: Query,
  salts: IntegrityToDisclosureSalts,
  serviceScope: bigint,
  serviceSubScope: bigint,
  timestamp: number,
) => Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any

const INPUT_BUILDERS: Partial<Record<DisclosureCircuitName, CircuitInputBuilder>> = {
  disclose_bytes: (w, q, s, scope, subscope, ts) =>
    getDiscloseCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  compare_age: (w, q, s, scope, subscope, ts) =>
    getAgeCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  compare_birthdate: (w, q, s, scope, subscope, ts) =>
    getBirthdateCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  compare_expiry: (w, q, s, scope, subscope, ts) =>
    getExpiryDateCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  inclusion_check_nationality: (w, q, s, scope, subscope, ts) =>
    getNationalityInclusionCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  exclusion_check_nationality: (w, q, s, scope, subscope, ts) =>
    getNationalityExclusionCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  inclusion_check_issuing_country: (w, q, s, scope, subscope, ts) =>
    getIssuingCountryInclusionCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  exclusion_check_issuing_country: (w, q, s, scope, subscope, ts) =>
    getIssuingCountryExclusionCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  bind: (w, q, s, scope, subscope, ts) =>
    getBindCircuitInputsFromWitness(w, q, s, 0n, scope, subscope, ts),
  exclusion_check_sanctions: (w, q, s, scope, subscope, ts) =>
    getSanctionsExclusionCheckCircuitInputsFromWitness(
      w,
      q.sanctions?.strict ?? false,
      s,
      0n,
      scope,
      subscope,
      ts,
    ),
}

function stripHexPrefix(value: string): string {
  return value.startsWith("0x") ? value.slice(2) : value
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

/**
 * Assemble a proof hex string in the same layout the mobile app produces:
 * `[public inputs as 32-byte fields][proof body fields]`, no 0x prefix.
 */
function assembleProofHex(proof: Uint8Array, publicInputs: string[]): string {
  return (
    publicInputs.map((input) => stripHexPrefix(input).padStart(64, "0")).join("") + toHex(proof)
  )
}

/**
 * Generate all disclosure proofs required by the query locally in the browser,
 * chained to the enrollment bundle's base subproofs.
 *
 * Returns the full proof set (3 base subproofs + N disclosure proofs) plus the
 * QueryResult, in the same shapes the bridge flow produces — so the standard
 * `verify()` path works unchanged.
 */
export async function proveLocally({
  bundle,
  query,
  domain,
  scope,
  devMode = false,
  onProgress,
}: {
  bundle: EnrollmentBundle
  query: Query
  domain: string
  scope?: string
  devMode?: boolean
  onProgress?: (progress: LocalProofProgress) => void
}): Promise<{ proofs: ProofResult[]; queryResult: QueryResult }> {
  // 1. Determine required circuits and make sure they are all locally provable
  const circuitNames = getRequiredDisclosureCircuitNames(query)
  const unsupported = circuitNames.filter((name) => !SUPPORTED_LOCAL_CIRCUITS.includes(name))
  if (unsupported.length > 0) {
    throw new UnsupportedQueryError(
      `Query requires circuits that cannot be proven in the browser: ${unsupported.join(", ")}`,
    )
  }

  // 2. Browser proving only supports v5 circuits (noir_js matches the v5 toolchain)
  if (getBBVersionForCircuitVersion(bundle.circuitVersion) !== "v5") {
    throw new EnrollmentStaleError(
      `Enrollment circuit version ${bundle.circuitVersion} is too old for browser proving`,
    )
  }

  // 3. Fetch the manifest for the enrolled circuit version and check staleness
  // (all served from the warm-up caches when the page preloaded them)
  const manifest = await getManifestCached(bundle.circuitVersion, devMode)
  if (!(await isCircuitRootValidCached(manifest.root, devMode))) {
    throw new EnrollmentStaleError("Enrolled circuit version is no longer registered")
  }
  if (!(await isCertificateRootValidCached(bundle.certificateRegistryRoot, devMode))) {
    throw new EnrollmentStaleError(
      "Certificate registry root of the enrolled base proofs is no longer valid",
    )
  }

  // 4. Compute the request-scoped values
  const witness = bundle.witness
  const salts = getIntegrityToDisclosureSalts(BigInt(witness.salt))
  const serviceScope = getServiceScopeHash(domain)
  const serviceSubScope = getServiceSubscopeHash(scope ?? "")
  const timestamp = getNowTimestamp()

  // 5. Proving stack from the shared caches (already live when warmed up)
  const [{ Noir, UltraHonkBackend }, barretenberg] = await Promise.all([
    getProvingModules(),
    getSharedBarretenberg(),
  ])

  // Prefetch the base subproof circuits in the background while we prove: the
  // subsequent verify() step needs their vkeys and will hit the cache
  for (const baseProof of bundle.baseSubproofs) {
    if (baseProof.name) {
      getPackagedCircuitCached(baseProof.name, manifest, devMode).catch(() => {})
    }
  }

  // The integrity check subproof's comm_out, which every disclosure proof must chain from
  const integrityProof = bundle.baseSubproofs[2]
  const integrityCommOut = BigInt(
    getProofData(integrityProof.proof!, getNumberOfPublicInputs(integrityProof.name!))
      .publicInputs[1],
  )

  const total = circuitNames.length
  const disclosureProofs: ProofResult[] = []
  for (let i = 0; i < circuitNames.length; i++) {
    const circuitName = circuitNames[i]
    onProgress?.({ current: i + 1, total, circuit: circuitName })

    const inputBuilder = INPUT_BUILDERS[circuitName]!
    const [circuit, inputs] = await Promise.all([
      getPackagedCircuitCached(circuitName, manifest, devMode),
      inputBuilder(witness, query, salts, serviceScope, serviceSubScope, timestamp),
    ])
    if (!inputs) {
      throw new Error(`Failed to build inputs for circuit ${circuitName}`)
    }

    // Sanity check before spending proving time: the disclosure comm_in must chain
    // from the integrity subproof's comm_out, otherwise the salt/witness doesn't
    // match the enrolled base proofs
    if (BigInt(inputs.comm_in) !== integrityCommOut) {
      throw new EnrollmentStaleError(
        "Enrollment witness does not chain from the enrolled base proofs",
      )
    }

    const noir = new Noir({
      bytecode: circuit.bytecode,
      abi: circuit.abi,
    } as never)
    const { witness: executionWitness } = await noir.execute(inputs)
    const backend = new UltraHonkBackend(circuit.bytecode, barretenberg)
    // No options: poseidon2 oracle hash + ZK enabled, matching the proofs the
    // mobile app generates and the settings verify() checks against
    const { proof, publicInputs } = await backend.generateProof(executionWitness)

    disclosureProofs.push({
      proof: assembleProofHex(proof, publicInputs),
      vkeyHash: circuit.vkey_hash,
      name: circuitName,
      version: manifest.version as ProofResult["version"],
      committedInputs: {
        [circuitName]: getCommittedInputsForCircuit(inputs, circuitName),
      },
    })
  }

  const totalProofs = bundle.baseSubproofs.length + disclosureProofs.length
  const proofs: ProofResult[] = [
    ...bundle.baseSubproofs.map((proof, index) => ({
      ...proof,
      version: (proof.version ?? bundle.circuitVersion) as ProofResult["version"],
      index,
      total: totalProofs,
    })),
    ...disclosureProofs.map((proof, index) => ({
      ...proof,
      index: bundle.baseSubproofs.length + index,
      total: totalProofs,
    })),
  ]

  const queryResult = buildQueryResultFromWitness(query, witness, {
    sanctionsPassed: circuitNames.includes("exclusion_check_sanctions"),
  })

  return { proofs, queryResult }
  // NOTE: the shared Barretenberg instance is intentionally kept alive (owned by
  // prover-cache) so subsequent proofs skip WASM re-initialization
}
