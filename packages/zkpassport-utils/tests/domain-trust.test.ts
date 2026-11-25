import { describe, expect, test } from "bun:test"
import {
  checkDomainTrust,
  createProjectLookup,
  normalizeHostname,
  type PublicProject,
} from "../src/domain-trust"

const project: PublicProject = {
  domain: "salz.com",
  domainVerified: true,
  allowedOrigins: ["https://app.example.com"],
}

function check(
  origin: string | undefined,
  domain: string,
  found: PublicProject | null | Error = null,
) {
  let lookups = 0
  const trust = checkDomainTrust({
    origin,
    domain,
    trustedOrigins: ["verify.zkpassport.id"],
    lookupProject: async () => {
      lookups++
      if (found instanceof Error) throw found
      return found
    },
  })
  return trust.then((result) => ({ ...result, lookups }))
}

describe("normalizeHostname", () => {
  test("keeps only the host", () => {
    expect(normalizeHostname(" HTTPS://Example.com:8080/a/b?c=d#e ")).toBe("example.com")
    expect(normalizeHostname("example.com/a/b")).toBe("example.com")
    expect(normalizeHostname("example.com?x=1")).toBe("example.com")
    expect(normalizeHostname(undefined)).toBe("")
  })

  test("reads a domain with a dotted scheme as the host after it", () => {
    expect(normalizeHostname("evil.com://salz.com")).toBe("salz.com")
  })
})

describe("checkDomainTrust", () => {
  test("verifies the domain's own site without asking the dashboard", async () => {
    expect(await check("https://salz.com", "salz.com")).toMatchObject({
      status: "verified",
      reason: "same-host",
      lookups: 0,
    })
    expect(await check("https://www.salz.com", "salz.com")).toMatchObject({
      status: "verified",
      reason: "www-alias",
      lookups: 0,
    })
    expect(await check("https://new.salz.com", "salz.com")).toMatchObject({
      status: "verified",
      reason: "subdomain",
      lookups: 0,
    })
    expect(await check("https://salz.com", "new.salz.com")).toMatchObject({
      status: "verified",
      reason: "parent-domain",
      lookups: 0,
    })
  })

  test("verifies localhost and a trusted origin for any domain", async () => {
    expect(await check("http://localhost:3000", "salz.com")).toMatchObject({
      status: "verified",
      reason: "localhost",
      lookups: 0,
    })
    expect(await check("https://verify.zkpassport.id", "salz.com")).toMatchObject({
      status: "verified",
      reason: "trusted-origin",
      lookups: 0,
    })
  })

  test("blocks a different site when the domain has no verified project", async () => {
    expect(await check("https://ssss.com", "salz.com")).toMatchObject({
      status: "blocked",
      reason: "no-project",
    })
    expect(
      await check("https://app.example.com", "salz.com", { ...project, domainVerified: false }),
    ).toMatchObject({
      status: "blocked",
      reason: "no-project",
    })
    expect(
      await check("https://app.example.com", "salz.com", { ...project, domain: "other.com" }),
    ).toMatchObject({
      status: "blocked",
      reason: "no-project",
    })
  })

  test("follows the verified project's allowed origins for a different site", async () => {
    expect(await check("https://app.example.com", "salz.com", project)).toMatchObject({
      status: "verified",
      reason: "allowed-origin",
    })
    expect(await check("https://ssss.com", "salz.com", project)).toMatchObject({
      status: "blocked",
      reason: "origin-not-allowed",
    })
  })

  test("does not take a look-alike host for a subdomain", async () => {
    expect(await check("https://evil-salz.com", "salz.com")).toMatchObject({ status: "blocked" })
    expect(await check("https://salz.com.evil.com", "salz.com")).toMatchObject({
      status: "blocked",
    })
  })

  test("does not treat a subdomain of a shared hosting domain as the same site", async () => {
    expect(await check("https://attacker.vercel.app", "vercel.app")).toMatchObject({
      status: "blocked",
      reason: "no-project",
    })
    expect(await check("https://attacker.s3.amazonaws.com", "s3.amazonaws.com")).toMatchObject({
      status: "blocked",
    })
    expect(await check("https://vercel.app", "victim.vercel.app")).toMatchObject({
      status: "blocked",
    })
    expect(await check("https://evil.com", "com")).toMatchObject({ status: "blocked" })
  })

  test("blocks a different site while the dashboard cannot be reached, and nothing else", async () => {
    const down = new Error("network down")
    expect(await check("https://ssss.com", "salz.com", down)).toMatchObject({
      status: "blocked",
      reason: "lookup-failed",
    })
    expect(await check("https://new.salz.com", "salz.com", down)).toMatchObject({
      status: "verified",
    })
    expect(await check(undefined, "salz.com", down)).toMatchObject({ status: "unverified" })
  })

  test("leaves a request without a page origin unverified", async () => {
    expect(await check(undefined, "salz.com")).toMatchObject({
      status: "unverified",
      reason: "no-origin",
      lookups: 0,
    })
    expect(await check("none", "salz.com")).toMatchObject({
      status: "unverified",
      reason: "no-origin",
      lookups: 0,
    })
    expect(await check("nodejs", "salz.com")).toMatchObject({
      status: "unverified",
      reason: "non-browser",
      lookups: 0,
    })
  })
})

describe("createProjectLookup", () => {
  const respond = (status: number, body: unknown) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch

  test("returns the project the dashboard has for the domain", async () => {
    const lookup = createProjectLookup({
      apiUrl: "https://api.example/",
      fetch: respond(200, { project }),
    })
    expect(await lookup("salz.com")).toEqual(project)
  })

  test("returns null when the dashboard has no project", async () => {
    const lookup = createProjectLookup({
      apiUrl: "https://api.example",
      fetch: respond(200, { project: null }),
    })
    expect(await lookup("salz.com")).toBeNull()
  })

  test("fails when the dashboard does not answer properly", async () => {
    const lookup = createProjectLookup({ apiUrl: "https://api.example", fetch: respond(503, {}) })
    expect(lookup("salz.com")).rejects.toThrow()
  })
})
