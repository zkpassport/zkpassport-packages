import { readFileSync } from "fs"
import { getSanctionsParameterCommitment } from "@zkpassport/utils"
import { createOfflineQuery, ZKPassport } from "../src/index"

// The Aztec verifier's Query (packages/aztec/noir/verifier/src/query.nr) builds the commitments
// a contract expects from the same calls as this SDK's query builders. The anchors in the
// Aztec core crate's fixtures.nr pin what a call commits to: the Noir tests hold Query to them,
// and these tests hold the SDK to them, so a default changed on one side fails on that side.
const FIXTURES_NR = readFileSync(
  new URL("../../aztec/noir/core/src/fixtures.nr", import.meta.url),
  "utf8",
)

function anchor(name: string): bigint {
  const match = FIXTURES_NR.match(new RegExp(`global ${name}: Field =\\s*(0x[0-9a-f]+);`))
  if (!match) throw new Error(`${name} is missing from fixtures.nr`)
  return BigInt(match[1])
}

const SANCTIONS_ROOT = "0x" + anchor("SANCTIONS_ROOT").toString(16).padStart(64, "0")

describe("sanctions() asks for the commitment the Aztec verifier's sanctions() expects", () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    // request() fetches the dashboard config best-effort; stub so tests stay offline.
    originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response("{}", { status: 404 })) as unknown as typeof globalThis.fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("from request()'s builder", async () => {
    const builder = await new ZKPassport("localhost").request({
      name: "Test App",
      logo: "https://test.com/logo.png",
      purpose: "Testing the sanctions default",
    })
    const { url } = builder.sanctions().done()
    const config = JSON.parse(Buffer.from(new URL(url).searchParams.get("c")!, "base64").toString())

    expect(await getSanctionsParameterCommitment(SANCTIONS_ROOT, config.sanctions.strict)).toBe(
      anchor("SANCTIONS_COMMITMENT"),
    )
  })

  test("from the offline builder", async () => {
    const { query } = createOfflineQuery().sanctions().done()

    expect(await getSanctionsParameterCommitment(SANCTIONS_ROOT, query.sanctions!.strict!)).toBe(
      anchor("SANCTIONS_COMMITMENT"),
    )
  })
})
