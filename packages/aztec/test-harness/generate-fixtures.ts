// Usage (from the repo root):
//
// `bun i && bun run --cwd packages/zkpassport-utils build`
//
// then:
//
// `bun packages/aztec/test-harness/generate-fixtures.ts`.
//
// Emits `fixtures.json` (next to this script) with Poseidon2 param commitments computed by this
// repo's `@zkpassport/utils`. We use these fixtures to verify that the parameter commitments
// computed by `zkpassport_core` in-circuit match exactly the prover-side TS (exposed through
// `zkpassport/utils`).
//
// Since Noir tests can't call the TS reference implementation, this script generates examples,
// which then are pinned in Noir tests.
import {
  getAgeParameterCommitment, // (minAge: number, maxAge: number) => Promise<bigint>
  getBindParameterCommitment, // (data: number[], maxLength?: number) => Promise<bigint>
  getDiscloseParameterCommitment, // (discloseMask: number[], disclosedBytes: number[]) => Promise<bigint>
} from "../../zkpassport-utils/dist/esm/index.js"
import { writeFileSync } from "fs"
import { fileURLToPath } from "url"

const OUT = fileURLToPath(new URL("./fixtures.json", import.meta.url))
const hex = (b: bigint) => "0x" + b.toString(16).padStart(64, "0")

async function main() {
  // age: the example's policy (18+, no max)
  const age_18_0 = await getAgeParameterCommitment(18, 0)

  // bind(user_address): layout [identifier=1][len_hi=0][len_lo=32][32 bytes BE address].
  // The account is an arbitrary stand-in for user.to_field() (not a real address), but the
  // repeating byte pattern is deliberate: every position holds a distinct value, so an
  // endianness flip, an offset bug, or wrong padding changes the commitment and fails the
  // golden test — a degenerate value like 0x1 would mask exactly those. It also stays below
  // the BN254 modulus, so it round-trips as a Field without reduction. Must match the Noir
  // test's GOLDEN_ACCOUNT literal-for-literal.
  const account = 0x1122334455667788990011223344556677889900112233445566778899001122n
  const addrBytes = Array.from({ length: 32 }, (_, i) =>
    Number((account >> BigInt(8 * (31 - i))) & 0xffn),
  )
  const bindData = [1, 0, 32, ...addrBytes]
  const bind_account = await getBindParameterCommitment(bindData, 509)

  // disclose: nationality-only mask (TD3 nationality at MRZ index 54, length 3), bytes "AUS"
  const mask = Array(90).fill(0)
  mask[54] = 1
  mask[55] = 1
  mask[56] = 1
  const disclosed = Array(90).fill(0)
  disclosed[54] = 65
  disclosed[55] = 85
  disclosed[56] = 83 // "AUS"
  const disclose_nationality = await getDiscloseParameterCommitment(mask, disclosed)

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        account: hex(account),
        age_18_0: hex(age_18_0),
        bind_account: hex(bind_account),
        disclose_nationality_mask_indices: [54, 55, 56],
        disclose_nationality: hex(disclose_nationality),
      },
      null,
      2,
    ),
  )
  console.log("wrote", OUT)
}
main()
