import { afterEach, describe, expect, test } from "bun:test"
import type { RegistryClient } from "../src/client"
import { withLocalCertificates } from "../src/local-certificates"

const LOCAL = { version: 1, root: "0x0abc", certificates: [] }
const realFetch = globalThis.fetch

const fakeClient = () =>
  ({
    getCertificates: async () => ({ version: 1, root: "0x0def", certificates: [] }),
    getLatestCertificateRoot: async () => "0x0def",
    isCertificateRootValid: async (root: string) => BigInt(root) === 0xdefn,
  }) as unknown as RegistryClient

const serve = (body: object | null) => {
  globalThis.fetch = (async () =>
    body ? new Response(JSON.stringify(body)) : new Response("not found", { status: 404 })) as any
}

afterEach(() => {
  globalThis.fetch = realFetch
})

describe("withLocalCertificates", () => {
  test("takes the certificates and the latest root from the served file", async () => {
    serve(LOCAL)
    const client = withLocalCertificates(fakeClient(), "http://localhost:8000/certificates.json")
    expect((await client.getCertificates()).root).toBe("0x0abc")
    expect(await client.getLatestCertificateRoot()).toBe("0x0abc")
    expect(await client.isCertificateRootValid("abc")).toBe(true)
    expect(await client.isCertificateRootValid("0x0def")).toBe(true)
    expect(await client.isCertificateRootValid("0x0123")).toBe(false)
  })

  test("leaves the client as it was when nothing is served", async () => {
    serve(null)
    const client = withLocalCertificates(fakeClient(), "http://localhost:8000/certificates.json")
    expect((await client.getCertificates()).root).toBe("0x0def")
    expect(await client.getLatestCertificateRoot()).toBe("0x0def")
    expect(await client.isCertificateRootValid("0x0abc")).toBe(false)
  })
})
