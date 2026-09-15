/**
 * Convert an outer-proof fixture JSON into recursive_verification's Prover.toml.
 *
 * Usage: bun fixture-to-prover-toml.ts <fixture.json> <Prover.toml> [tamper-mode]
 *
 * Tamper modes:
 *   --tamper-proof         flip the last hex digit of proof[-1]  -> dies at `bb prove`/`bb verify`
 *   --tamper-public-input  flip the last hex digit of public_inputs[0]
 *                          -> dies at `bb prove`/`bb verify` (recursion constraint over the PI
 *                             array -- the load-bearing control: nothing downstream in-circuit
 *                             reads public_inputs[0], so this is the only layer that catches it)
 */
import { readFileSync, writeFileSync } from "fs"

const TAMPER_MODES = ["--tamper-proof", "--tamper-public-input"]

const tomlFieldArray = (name: string, values: string[]) =>
  `${name} = [${values.map((v) => `"${v}"`).join(", ")}]\n`

const tomlBoolArray = (name: string, values: (boolean | number)[]) =>
  `${name} = [${values.map((v) => (v ? "true" : "false")).join(", ")}]\n`

const tomlIntArray = (name: string, values: number[]) =>
  `${name} = [${values.map((v) => String(Math.trunc(v))).join(", ")}]\n`

const flipLastHexDigit = (value: string) =>
  value.slice(0, -1) + (value.endsWith("0") ? "1" : "0")

function main() {
  const [fixturePath, outPath, ...rest] = process.argv.slice(2)
  const modes = rest.filter((a) => a)
  for (const m of modes) {
    if (!TAMPER_MODES.includes(m)) {
      throw new Error(`unknown tamper mode '${m}'; expected one of ${TAMPER_MODES.join(", ")}`)
    }
  }

  const fx = JSON.parse(readFileSync(fixturePath, "utf8"))

  const vk: string[] = fx.vkeyFields
  const proof: string[] = [...fx.proof]
  const pis: string[] = fx.publicInputs
  const expectedVkHash: string = fx.vkeyHashBB

  if (!("discloseMask" in fx) || !("disclosedBytes" in fx)) {
    throw new Error(
      `${fixturePath} has no discloseMask/disclosedBytes -- recursive_verification only ` +
        `drives the disclose variant (kind=${fx.kind})`,
    )
  }
  const mask: number[] = [...fx.discloseMask]
  const disclosed: number[] = [...fx.disclosedBytes]

  const expectLen = (name: string, arr: unknown[], len: number) => {
    if (arr.length !== len) throw new Error(`${name} len ${arr.length}, expected ${len}`)
  }
  expectLen("vk", vk, 115)
  expectLen("proof", proof, 458)
  expectLen("publicInputs", pis, 9)
  expectLen("discloseMask", mask, 90)
  expectLen("disclosedBytes", disclosed, 90)

  console.log(
    `vk=${vk.length} proof=${proof.length} publicInputs=${pis.length} ` +
      `mask=${mask.length} disclosed=${disclosed.length} expected_vk_hash=${expectedVkHash}`,
  )

  if (modes.includes("--tamper-proof")) {
    const flipped = flipLastHexDigit(proof[proof.length - 1])
    console.log(`TAMPER(proof): proof[-1] ${proof[proof.length - 1]} -> ${flipped}`)
    proof[proof.length - 1] = flipped
  }

  if (modes.includes("--tamper-public-input")) {
    const flipped = flipLastHexDigit(pis[0])
    console.log(`TAMPER(public-input): public_inputs[0] ${pis[0]} -> ${flipped}`)
    pis[0] = flipped
  }

  writeFileSync(
    outPath,
    tomlFieldArray("verification_key", vk) +
      tomlFieldArray("proof", proof) +
      tomlFieldArray("public_inputs", pis) +
      `expected_vk_hash = "${expectedVkHash}"\n` +
      tomlBoolArray("disclose_mask", mask) +
      tomlIntArray("disclosed_bytes", disclosed),
  )
}

main()
