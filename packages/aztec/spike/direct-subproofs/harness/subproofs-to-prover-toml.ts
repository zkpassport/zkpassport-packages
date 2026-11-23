/**
 * Convert a subproofs dump (generate-proof-fixtures.ts with SUBPROOFS_OUT) into a direct-subproofs
 * harness Prover.toml.
 *
 * Usage: bun subproofs-to-prover-toml.ts <subproofs.json> <Prover.toml> [mode] [other.json]
 *
 * Negative controls:
 *   --tamper-proof          flip the last digit of the last disclosure proof's last field
 *                           -> only the recursion catches it (bb prove / bb verify)
 *   --splice-csc <other>    take the CSC->DSC proof and certificate root from another run: a valid
 *                           proof of another chain -> only the comm chain assertion catches it
 *   --wrong-vk-path         flip a sibling in the last disclosure's circuit-tree path
 *                           -> "Disclosure proof vkey hash not found in circuit tree"
 *   --mismatched-nullifier  flip the claimed top-level scoped nullifier
 *                           -> "Disclosure proof scoped nullifier must be either 0 or ..."
 *   --zeroed-nullifier      claim the first disclosure proof has no nullifier (0) although it has
 *                           one: the glue allows 0, so only the recursion catches it
 */
import { readFileSync, writeFileSync } from "fs"

const MODES = [
  "--tamper-proof",
  "--splice-csc",
  "--wrong-vk-path",
  "--mismatched-nullifier",
  "--zeroed-nullifier",
]

type OuterSubproof = {
  vkey: string[]
  proof: string[]
  public_inputs: string[]
  key_hash: string
  tree_hash_path: string[]
  tree_index: string
}

const quote = (v: string | number) => `"${typeof v === "number" ? `0x${v.toString(16)}` : v}"`
const fieldArray = (name: string, values: string[]) =>
  `${name} = [${values.map(quote).join(", ")}]\n`
const flipLastHexDigit = (value: string) => value.slice(0, -1) + (value.endsWith("0") ? "1" : "0")

function subproofTable(header: string, s: OuterSubproof): string {
  return (
    `${header}\n` +
    fieldArray("vkey", s.vkey) +
    fieldArray("proof", s.proof) +
    fieldArray("public_inputs", s.public_inputs) +
    `tree_index = ${quote(s.tree_index.startsWith("0x") ? s.tree_index : Number(s.tree_index))}\n` +
    fieldArray("tree_hash_path", s.tree_hash_path)
  )
}

function main() {
  const [inPath, outPath, mode, otherPath] = process.argv.slice(2)
  if (mode && !MODES.includes(mode)) throw new Error(`unknown mode ${mode}`)

  const dump = JSON.parse(readFileSync(inPath, "utf8"))
  const inputs = structuredClone(dump.outerInputs)
  const disclosures: OuterSubproof[] = inputs.disclosure_proofs
  const last = disclosures[disclosures.length - 1]

  switch (mode) {
    case "--tamper-proof":
      last.proof[last.proof.length - 1] = flipLastHexDigit(last.proof[last.proof.length - 1])
      break
    case "--splice-csc": {
      if (!otherPath) throw new Error("--splice-csc needs another subproofs dump")
      const other = JSON.parse(readFileSync(otherPath, "utf8")).outerInputs
      if (other.csc_to_dsc_proof.public_inputs[0] === inputs.csc_to_dsc_proof.public_inputs[0]) {
        throw new Error("the other run has the same CSC->DSC comm_out: nothing to splice")
      }
      inputs.csc_to_dsc_proof = other.csc_to_dsc_proof
      inputs.certificate_registry_root = other.certificate_registry_root
      break
    }
    case "--wrong-vk-path":
      last.tree_hash_path[0] = flipLastHexDigit(last.tree_hash_path[0])
      break
    case "--mismatched-nullifier":
      inputs.scoped_nullifier = flipLastHexDigit(inputs.scoped_nullifier)
      break
    case "--zeroed-nullifier":
      if (BigInt(disclosures[0].public_inputs[1]) === 0n) throw new Error("no nullifier to zero")
      if (!disclosures.slice(1).some((d) => BigInt(d.public_inputs[1]) !== 0n)) {
        throw new Error("no other disclosure carries the nullifier")
      }
      disclosures[0].public_inputs[1] = "0x00"
      break
  }
  if (mode) console.log(`negative control: ${mode}`)

  const pi =
    "[subproofs.public_inputs]\n" +
    `certificate_registry_root = ${quote(inputs.certificate_registry_root)}\n` +
    `circuit_registry_root = ${quote(inputs.circuit_registry_root)}\n` +
    `current_date = ${quote(Number(inputs.current_date))}\n` +
    `service_scope = ${quote(inputs.service_scope)}\n` +
    `service_subscope = ${quote(inputs.service_subscope)}\n` +
    fieldArray("param_commitments", inputs.param_commitments) +
    `nullifier_type = ${quote(inputs.nullifier_type)}\n` +
    `scoped_nullifier = ${quote(inputs.scoped_nullifier)}\n` +
    `oprf_pk_hash = ${quote(inputs.oprf_pk_hash)}\n` +
    `verification_method = ${quote(inputs.verification_method)}\n`

  // The app's expectations come from the unmodified dump: what the request asked for.
  writeFileSync(
    outPath,
    `domain = ${quote(dump.outerInputs.service_scope)}\n` +
      fieldArray("expected_commitments", dump.outerInputs.param_commitments) +
      pi +
      subproofTable("[subproofs.csc_to_dsc_proof]", inputs.csc_to_dsc_proof) +
      subproofTable("[subproofs.dsc_to_id_data_proof]", inputs.dsc_to_id_data_proof) +
      subproofTable("[subproofs.integrity_check_proof]", inputs.integrity_check_proof) +
      disclosures.map((d) => subproofTable("[[subproofs.disclosure_proofs]]", d)).join(""),
  )
}

main()
