import { describe, expect, test } from "bun:test"
import type { ProofResult } from "@zkpassport/utils"
import { ZKPassport } from "../src/index"

const proof: ProofResult = {
  name: "outer_evm_3",
  version: "0.21.1",
  vkeyHash: "0x1234",
  proof: "aa".repeat(32 * 8) + "bb".repeat(32 * 12),
}

function domainOf(domain: string): string {
  return new ZKPassport(domain).getSolidityVerifierParameters({ proof }).serviceConfig.domain
}

describe("the SDK's domain", () => {
  test("is the hostname, lowercased", () => {
    expect(domainOf(" Example.COM ")).toBe("example.com")
  })

  test("drops the protocol, port, path, query and fragment of a URL", () => {
    expect(domainOf("https://app.example.com:8443/a/b?ref=1#top")).toBe("app.example.com")
    expect(domainOf("HTTP://localhost:3000/")).toBe("localhost")
  })

  test("writes an internationalized domain in its ASCII xn-- form, as a browser reports it", () => {
    expect(domainOf("Bücher.de")).toBe("xn--bcher-kva.de")
    expect(domainOf("https://例え.jp/path")).toBe("xn--r8jz45g.jp")
    expect(domainOf("xn--bcher-kva.de")).toBe("xn--bcher-kva.de")
  })

  test("rejects what isn't a hostname", () => {
    expect(() => new ZKPassport("exa mple.com")).toThrow("Invalid domain 'exa mple.com'")
  })
})
