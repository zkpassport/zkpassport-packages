import { type ContractArtifact, loadContractArtifact, type NoirCompiledContract } from "@aztec-labs/aztec.js/abi"
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { Fr } from "@aztec-labs/aztec.js/fields"
import { Capsule } from "@aztec-labs/stdlib/tx"
import { readFileSync } from "fs"

const here = (p: string) => new URL(p, import.meta.url)
const json = (p: string) => JSON.parse(readFileSync(here(p), "utf8"))
const artifactAt = (p: string): ContractArtifact =>
  loadContractArtifact(json(`../noir/target/${p}.json`) as NoirCompiledContract)

export const NODE_URL = process.env.AZTEC_NODE_URL ?? "http://localhost:8080"
export const DEPLOYMENT = here("./deployment.json")

export const ARTIFACTS = {
  test: artifactAt("zkpassport_subproofs_test_contract-SubproofsVerifierTest"),
  registry: artifactAt("zkpassport_registry_standin_contract-RegistryStandIn"),
  verifier: artifactAt("zkpassport_subproofs_verifier_contract-SubproofsVerifier"),
}
export type Deployment = Record<keyof typeof ARTIFACTS, AztecAddress>

export function readDeployment(): Deployment {
  const raw = JSON.parse(readFileSync(DEPLOYMENT, "utf8"))
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, AztecAddress.fromStringUnsafe(v as string)])) as Deployment
}

// zkpassport::constants and zkpassport_subproofs_aztec::SUBPROOFS_CAPSULE_SLOT
const PROOF_CAPSULE_SLOT = 1n
const DISCLOSE_CAPSULE_SLOT = 2n
const SUBPROOFS_CAPSULE_SLOT = 10n

const fr = (v: string | number) =>
  typeof v === "number" ? new Fr(BigInt(v)) : v.startsWith("0x") ? Fr.fromHexString(v) : new Fr(BigInt(v))

type OuterSubproof = { vkey: string[]; proof: string[]; public_inputs: string[]; tree_index: string; tree_hash_path: string[] }

const subproofFields = (s: OuterSubproof) =>
  [...s.vkey, ...s.proof, ...s.public_inputs, s.tree_index, ...s.tree_hash_path].map(fr)

export type Bench =
  | `bench_${"outer" | "direct"}_${5 | 7}`
  | `shape_${"app" | "registry" | "verifier"}_${5 | 7}`

/**
 * The arguments and capsules a bench function takes. Subproof capsules go to the contract that
 * reads them: the app (A), the registry (C) or the verifier (D). The disclose capsule always goes
 * to the app, which computes the expected commitments.
 */
export function benchInputs(fn: Bench, d: Deployment, scope: AztecAddress) {
  const count = fn.endsWith("_5") ? 5 : 7
  const outer = json(`../fixtures/outer_count_${count}.json`)
  const dump = json(`../fixtures/subproofs_${count}.json`)
  const user = AztecAddress.fromStringUnsafe(outer.bindAddress)
  const glueHost = fn.startsWith("shape_registry") ? d.registry : fn.startsWith("shape_verifier") ? d.verifier : d.test
  const capsule = (contract: AztecAddress, slot: bigint, data: Fr[]) => new Capsule(contract, new Fr(slot), data, scope)

  const capsules: Capsule[] = []
  if (fn.startsWith("bench_outer")) {
    capsules.push(capsule(d.test, PROOF_CAPSULE_SLOT, [...outer.vkeyFields, ...outer.proof, ...outer.publicInputs].map(fr)))
  } else {
    const oi = dump.outerInputs
    const header = [
      oi.certificate_registry_root,
      oi.circuit_registry_root,
      Number(oi.current_date),
      oi.service_scope,
      oi.service_subscope,
      ...oi.param_commitments,
      oi.nullifier_type,
      oi.scoped_nullifier,
      oi.oprf_pk_hash,
      oi.verification_method,
    ].map(fr)
    capsules.push(capsule(glueHost, SUBPROOFS_CAPSULE_SLOT, header))
    const parts = [oi.csc_to_dsc_proof, oi.dsc_to_id_data_proof, oi.integrity_check_proof, ...oi.disclosure_proofs]
    // TAMPER=1 flips a field (TAMPER_INDEX, default the last) of the last disclosure proof: a negative control
    if (process.env.TAMPER === "1") {
      const last = parts[parts.length - 1]
      const at = Number(process.env.TAMPER_INDEX ?? last.proof.length - 1)
      last.proof[at] = last.proof[at].replace(/.$/, (c: string) => (c === "0" ? "1" : "0"))
    }
    parts.forEach((p: OuterSubproof, i: number) =>
      capsules.push(capsule(glueHost, SUBPROOFS_CAPSULE_SLOT + 1n + BigInt(i), subproofFields(p))),
    )
  }
  if (count === 7) {
    capsules.push(capsule(d.test, DISCLOSE_CAPSULE_SLOT, [...outer.discloseMask, ...outer.disclosedBytes].map((b: number) => new Fr(BigInt(b)))))
  }

  const args = fn.startsWith("shape_verifier")
    ? [user, d.verifier, d.registry]
    : fn.startsWith("shape_")
      ? [user, d.registry]
      : [user]
  return { args, capsules, fields: capsules.reduce((n, c) => n + c.data.length, 0) }
}
