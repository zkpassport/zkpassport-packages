import { describe, expect, test } from "bun:test"
import { CredentialTier } from "@zkpassport/utils"
import { ZKPassport, ONCHAIN_ATTESTED_SCOPE_PREFIX } from "../src/index"

describe("on-chain tier 2 requests", () => {
  const sdk = new ZKPassport("example.com")

  test("need a scope that opts in", async () => {
    await expect(
      sdk.request({
        mode: "compressed-evm",
        scope: "airdrop",
        allowedCredentials: [CredentialTier.GOVERNMENT_SIGNED, CredentialTier.DEVICE_ATTESTED],
      }),
    ).rejects.toThrow(ONCHAIN_ATTESTED_SCOPE_PREFIX)
  })

  test("a tier 1 on-chain request keeps any scope", async () => {
    // Fails later, without a network, but not on the scope
    const result = sdk
      .request({ mode: "compressed-evm", scope: "airdrop" })
      .then(() => "ok")
      .catch((error: Error) => error.message)
    expect(await result).not.toContain(ONCHAIN_ATTESTED_SCOPE_PREFIX)
  })
})
