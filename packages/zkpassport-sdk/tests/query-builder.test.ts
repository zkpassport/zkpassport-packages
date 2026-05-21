import { QueryBuilder, ZKPassport as ZkPassportVerifier } from "../src/index"
import { MockWebSocket } from "./helpers/mock-websocket"

describe("Query Builder", () => {
  let zkPassport: ZkPassportVerifier
  let queryBuilder: QueryBuilder
  let originalFetch: typeof globalThis.fetch

  beforeEach(async () => {
    MockWebSocket.clearHub()

    // request() fetches the dashboard config best-effort; stub so tests stay offline.
    originalFetch = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response("{}", {
        status: 404,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof globalThis.fetch

    zkPassport = new ZkPassportVerifier("localhost")
    queryBuilder = await zkPassport.request({
      name: "Test App",
      logo: "https://test.com/logo.png",
      purpose: "Testing query builder",
    })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("should build equality query with validation", async () => {
    const result = queryBuilder.eq("document_type", "passport").eq("gender", "female").done()

    expect(result.url).toContain("c=")
    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    // Test exact structure and values
    expect(config).toEqual({
      document_type: { eq: "passport" },
      gender: { eq: "female" },
    })

    // Test that no unexpected fields are present
    expect(Object.keys(config).length).toBe(2)
  })

  test("should build age comparison query with boundary validation", async () => {
    const result = queryBuilder.gte("age", 18).lt("age", 65).done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.age).toEqual({
      gte: 18,
      lt: 65,
    })
  })

  test("should build date range query with validation", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-12-31")
    const result = queryBuilder.range("birthdate", startDate, endDate).done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.birthdate.range).toEqual([startDate.toISOString(), endDate.toISOString()])
  })

  test("should build nationality inclusion/exclusion query with validation", async () => {
    const result = queryBuilder
      .in("nationality", ["FRA", "DEU", "ITA"])
      .out("nationality", ["USA", "GBR"])
      .done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.nationality).toEqual({
      in: ["FRA", "DEU", "ITA"],
      out: ["USA", "GBR"],
    })
  })

  test("should convert country names to Alpha-3 codes in nationality inclusion/exclusion query", async () => {
    const result = queryBuilder
      .in("nationality", ["France", "Germany", "Italy"])
      .out("nationality", ["United States", "United Kingdom"])
      .done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.nationality).toEqual({
      in: ["FRA", "DEU", "ITA"],
      out: ["USA", "GBR"],
    })
  })

  test("should build disclosure request with validation", async () => {
    const result = queryBuilder.disclose("fullname").disclose("birthdate").done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config).toEqual({
      fullname: { disclose: true },
      birthdate: { disclose: true },
    })
  })

  test("should combine multiple query types with complete validation", async () => {
    const startDate = new Date("2024-01-01")
    const result = queryBuilder
      .eq("document_type", "passport")
      .gte("age", 18)
      .in("nationality", ["FRA", "DEU"])
      .disclose("fullname")
      .range("expiry_date", startDate, new Date("2025-01-01"))
      .done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    // Test complete structure
    expect(config).toEqual({
      document_type: { eq: "passport" },
      age: { gte: 18 },
      nationality: { in: ["FRA", "DEU"] },
      fullname: { disclose: true },
      expiry_date: { range: [startDate.toISOString(), new Date("2025-01-01").toISOString()] },
    })

    // Verify URL format
    expect(result.url).toMatch(
      /^https:\/\/zkpassport\.id\/r\?d=[^&]+&t=[^&]+&c=[A-Za-z0-9+/=]+&s=[A-Za-z0-9+/=]+&p=[^&]+&m=[^&]+&v=[^&]+&dt=[^&]+&dev=[^&]+$/,
    )

    // Verify service info is included
    const servicePart = result.url.split("s=")[1].split("&")[0]
    const service = JSON.parse(Buffer.from(servicePart, "base64").toString())
    expect(service).toEqual({
      name: "Test App",
      logo: "https://test.com/logo.png",
      purpose: "Testing query builder",
      scope: "localhost",
    })
  })

  test("should handle inclusive bounds for age queries", async () => {
    const result = queryBuilder.gte("age", 18).lte("age", 25).done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.age).toEqual({
      gte: 18,
      lte: 25,
    })
  })

  test("should handle exclusive bounds for age queries", async () => {
    const result = queryBuilder.gt("age", 18).lt("age", 25).done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.age).toEqual({
      gt: 18,
      lt: 25,
    })
  })

  test("should handle inclusive bounds for birthdate queries", async () => {
    const result = queryBuilder
      .gte("birthdate", new Date("2024-01-01"))
      .lte("birthdate", new Date("2024-12-31"))
      .done()
    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.birthdate).toEqual({
      gte: new Date("2024-01-01").toISOString(),
      lte: new Date("2024-12-31").toISOString(),
    })
  })

  test("should handle exclusive bounds for birthdate queries", async () => {
    const result = queryBuilder
      .gt("birthdate", new Date("2024-01-01"))
      .lt("birthdate", new Date("2024-12-31"))
      .done()
    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.birthdate).toEqual({
      gt: new Date("2024-01-01").toISOString(),
      lt: new Date("2024-12-31").toISOString(),
    })
  })

  test("should handle inclusive bounds for expiry_date queries", async () => {
    const result = queryBuilder
      .gte("expiry_date", new Date("2024-01-01"))
      .lte("expiry_date", new Date("2024-12-31"))
      .done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.expiry_date).toEqual({
      gte: new Date("2024-01-01").toISOString(),
      lte: new Date("2024-12-31").toISOString(),
    })
  })

  test("should handle exclusive bounds for expiry_date queries", async () => {
    const result = queryBuilder
      .gt("expiry_date", new Date("2024-01-01"))
      .lt("expiry_date", new Date("2024-12-31"))
      .done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.expiry_date).toEqual({
      gt: new Date("2024-01-01").toISOString(),
      lt: new Date("2024-12-31").toISOString(),
    })
  })

  test("should build sanctions query defaulting to all countries and lists", async () => {
    const result = queryBuilder.sanctions().done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.sanctions).toEqual({
      countries: "all",
      lists: "all",
      strict: false,
    })
  })

  test("should build sanctions query with strict mode", async () => {
    const result = queryBuilder
      .sanctions("all", "all", {
        strict: true,
      })
      .done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.sanctions).toEqual({
      countries: "all",
      lists: "all",
      strict: true,
    })
  })

  /*test("should build sanctions query for single country", async () => {
    const result = queryBuilder.sanctions("GB").done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.sanctions).toEqual({
      countries: ["GB"],
      lists: "all",
      strict: false,
    })
  })

  test("should build sanctions query for single country with custom list", async () => {
    const result = queryBuilder.sanctions("US", ["OFAC_SDN"]).done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.sanctions).toEqual({
      countries: ["US"],
      lists: ["OFAC_SDN"],
      strict: false,
    })
  })

  test("should build sanctions query for multiple countries", async () => {
    const result = queryBuilder.sanctions(["US", "GB", "CH", "EU"]).done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.sanctions).toEqual({
      countries: ["US", "GB", "CH", "EU"],
      lists: "all",
      strict: false,
    })
  })

  test("should build sanctions query for multiple countries using multiple calls", async () => {
    const result = queryBuilder
      .sanctions("US")
      .sanctions("GB")
      .sanctions("CH")
      .sanctions("EU")
      .done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.sanctions).toEqual({
      countries: ["US", "GB", "CH", "EU"],
      lists: "all",
      strict: false,
    })
  })*/

  test("should build facematch query with strict mode", async () => {
    const result = queryBuilder.facematch("strict").done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.facematch).toEqual({
      mode: "strict",
    })
  })

  test("should build facematch query with regular mode", async () => {
    const result = queryBuilder.facematch("regular").done()

    const configPart = result.url.split("c=")[1].split("&")[0]
    const config = JSON.parse(Buffer.from(configPart, "base64").toString())

    expect(config.facematch).toEqual({
      mode: "regular",
    })
  })
})

describe("createQuery (offline mode)", () => {
  let zkPassport: ZkPassportVerifier

  beforeEach(() => {
    zkPassport = new ZkPassportVerifier("localhost")
  })

  test("done() returns only { query } without url or callbacks", () => {
    const result = zkPassport.createQuery().eq("nationality", "FRA").done()

    expect(result.query).toBeDefined()
    // Should NOT have online-mode properties
    expect((result as Record<string, unknown>).url).toBeUndefined()
    expect((result as Record<string, unknown>).requestId).toBeUndefined()
    expect((result as Record<string, unknown>).onResult).toBeUndefined()
    expect((result as Record<string, unknown>).onReject).toBeUndefined()
    expect((result as Record<string, unknown>).onError).toBeUndefined()
    expect((result as Record<string, unknown>).onBridgeConnect).toBeUndefined()
    expect((result as Record<string, unknown>).onRequestReceived).toBeUndefined()
    expect((result as Record<string, unknown>).onGeneratingProof).toBeUndefined()
    expect((result as Record<string, unknown>).onProofGenerated).toBeUndefined()
    expect((result as Record<string, unknown>).isBridgeConnected).toBeUndefined()
    expect((result as Record<string, unknown>).requestReceived).toBeUndefined()
  })

  test("should build equality query", () => {
    const result = zkPassport
      .createQuery()
      .eq("document_type", "passport")
      .eq("gender", "female")
      .done()

    expect(result.query).toEqual({
      document_type: { eq: "passport" },
      gender: { eq: "female" },
    })
  })

  test("should build age comparison query", () => {
    const result = zkPassport.createQuery().gte("age", 18).lt("age", 65).done()

    expect(result.query.age).toEqual({
      gte: 18,
      lt: 65,
    })
  })

  test("should build disclosure request", () => {
    const result = zkPassport.createQuery().disclose("fullname").disclose("birthdate").done()

    expect(result.query).toEqual({
      fullname: { disclose: true },
      birthdate: { disclose: true },
    })
  })

  test("should build nationality inclusion/exclusion query", () => {
    const result = zkPassport
      .createQuery()
      .in("nationality", ["FRA", "DEU"])
      .out("issuing_country", ["USA"])
      .done()

    expect(result.query.nationality).toEqual({ in: ["FRA", "DEU"] })
    expect(result.query.issuing_country).toEqual({ out: ["USA"] })
  })

  test("should build combined query", () => {
    const result = zkPassport
      .createQuery()
      .eq("document_type", "passport")
      .gte("age", 18)
      .disclose("fullname")
      .in("nationality", ["FRA", "DEU"])
      .sanctions()
      .done()

    expect(result.query).toEqual({
      document_type: { eq: "passport" },
      age: { gte: 18 },
      fullname: { disclose: true },
      nationality: { in: ["FRA", "DEU"] },
      sanctions: { countries: "all", lists: "all", strict: false },
    })
  })

  test("should build sanctions query with strict mode", () => {
    const result = zkPassport.createQuery().sanctions("all", "all", { strict: true }).done()

    expect(result.query.sanctions).toEqual({
      countries: "all",
      lists: "all",
      strict: true,
    })
  })

  test("should build bind query", () => {
    const result = zkPassport
      .createQuery()
      .bind("user_address", "0x1234abcd")
      .bind("chain", "ethereum")
      .done()

    expect(result.query.bind).toEqual({
      user_address: "0x1234abcd",
      chain: "ethereum",
    })
  })

  test("should build facematch query", () => {
    const result = zkPassport.createQuery().facematch("strict").done()

    expect(result.query.facematch).toEqual({ mode: "strict" })
  })
})

describe("Policy-driven requests", () => {
  let zkPassport: ZkPassportVerifier
  let originalFetch: typeof globalThis.fetch
  let lastFetchUrl: string | undefined
  let fetchCount: number

  const sampleConfig = {
    app: {
      name: "Dashboard Brand",
      domain: "localhost",
      logoUrl: "https://dashboard.example/logo.png",
      allowedOrigins: [],
    },
    policies: [
      {
        id: "pol_xyz",
        version: 3,
        name: "Age + nationality",
        purpose: "Policy purpose",
        applicationId: null,
        query: {
          age: { gte: 18 },
          firstname: { disclose: true },
          nationality: { in: ["FRA", "DEU"] },
        },
      },
      {
        id: "pol_other",
        version: 1,
        name: "Adults only",
        purpose: "",
        applicationId: null,
        query: { age: { gte: 21 } },
      },
    ],
  }

  function mockFetchReturning(body: object, status = 200) {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      lastFetchUrl = typeof input === "string" ? input : input.toString()
      fetchCount++
      return new Response(JSON.stringify(body), {
        status,
        statusText: status === 404 ? "Not Found" : "OK",
        headers: { "Content-Type": "application/json" },
      })
    }) as unknown as typeof globalThis.fetch
  }

  beforeEach(() => {
    MockWebSocket.clearHub()
    zkPassport = new ZkPassportVerifier("localhost")
    originalFetch = globalThis.fetch
    lastFetchUrl = undefined
    fetchCount = 0
    mockFetchReturning(sampleConfig)
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("fetches the per-domain config and uses the policy + branding", async () => {
    const queryBuilder = (await zkPassport.request({})).policy("pol_xyz")
    const result = queryBuilder.done()

    expect(lastFetchUrl).toBe("https://dashboard-api.zkpassport.id/public/app?domain=localhost")
    expect(result.policy).toBe("pol_xyz")
    expect(result.query).toEqual(sampleConfig.policies[0].query)

    const servicePart = result.url.split("s=")[1].split("&")[0]
    const service = JSON.parse(Buffer.from(servicePart, "base64").toString())
    expect(service).toMatchObject({
      name: "Dashboard Brand",
      logo: "https://dashboard.example/logo.png",
      purpose: "Policy purpose",
      scope: "pol_xyz:3",
    })
  })

  test("dashboard config is cached per instance: multiple requests trigger one fetch", async () => {
    ;(await zkPassport.request({})).policy("pol_xyz")
    ;(await zkPassport.request({})).policy("pol_other")
    ;(await zkPassport.request({})).policy("pol_xyz")
    expect(fetchCount).toBe(1)
  })

  test("per-request name/logo override dashboard branding (white-label)", async () => {
    const queryBuilder = (
      await zkPassport.request({
        name: "White Label",
        logo: "https://white.example/logo.png",
      })
    ).policy("pol_xyz")
    const result = queryBuilder.done()

    const servicePart = result.url.split("s=")[1].split("&")[0]
    const service = JSON.parse(Buffer.from(servicePart, "base64").toString())
    expect(service.name).toBe("White Label")
    expect(service.logo).toBe("https://white.example/logo.png")
    // purpose/scope are locked by the policy
    expect(service.purpose).toBe("Policy purpose")
    expect(service.scope).toBe("pol_xyz:3")
  })

  test("policy locks purpose and scope — per-request values are ignored", async () => {
    // scope drives the nullifier, so callers can't change it once a policy is bound.
    const queryBuilder = (
      await zkPassport.request({
        purpose: "Caller-supplied purpose",
        scope: "caller-supplied-scope",
      })
    ).policy("pol_xyz")
    const result = queryBuilder.done()

    const servicePart = result.url.split("s=")[1].split("&")[0]
    const service = JSON.parse(Buffer.from(servicePart, "base64").toString())
    expect(service.purpose).toBe("Policy purpose")
    expect(service.scope).toBe("pol_xyz:3")
  })

  test("self-serve callers get sensible defaults when no fields are supplied", async () => {
    const queryBuilder = await zkPassport.request({})
    const result = queryBuilder.done()
    const servicePart = result.url.split("s=")[1].split("&")[0]
    const service = JSON.parse(Buffer.from(servicePart, "base64").toString())
    // name/logo come from the dashboard config when registered; purpose/scope fall to defaults.
    expect(service.name).toBe("Dashboard Brand")
    expect(service.logo).toBe("https://dashboard.example/logo.png")
    expect(service.purpose).toBe("Verify identity privately")
    expect(service.scope).toBe("localhost")
  })

  test(".policy() throws a clear 'domain not registered' error on 404", async () => {
    mockFetchReturning({}, 404)
    const builder = await zkPassport.request({})
    expect(() => builder.policy("pol_xyz")).toThrow(/Domain 'localhost' is not registered/i)
  })

  test(".policy() throws when the requested policy id is not in the dashboard's policies array", async () => {
    const builder = await zkPassport.request({})
    expect(() => builder.policy("pol_missing")).toThrow(
      /Policy 'pol_missing' not found for domain 'localhost'/,
    )
  })

  test(".policy() throws when called after a builder method", async () => {
    // No branding here — otherwise the branding check could mask the
    // query-mutation check we're trying to test.
    const builder = await zkPassport.request({})
    builder.gte("age", 18)
    expect(() => builder.policy("pol_xyz")).toThrow(/Cannot combine \.policy\(\)/i)
  })

  test(".policy() throws when called more than once", async () => {
    const builder = (await zkPassport.request({})).policy("pol_xyz")
    expect(() => builder.policy("pol_xyz")).toThrow(/more than once/i)
  })

  test("every mutating builder method throws after .policy()", async () => {
    const builder = (await zkPassport.request({})).policy("pol_xyz")
    expect(() => builder.eq("document_type", "passport")).toThrow(/policy-driven/i)
    expect(() => builder.disclose("firstname")).toThrow(/policy-driven/i)
    expect(() => builder.sanctions()).toThrow(/policy-driven/i)
  })

  test(".policy() rejects an empty id", async () => {
    const builder = await zkPassport.request({})
    expect(() => builder.policy("")).toThrow(/non-empty string/)
  })

  test(".policy() rejects a policy with an invalid version", async () => {
    for (const version of [0, -1]) {
      mockFetchReturning({
        app: {
          name: "Brand",
          domain: "localhost",
          logoUrl: "https://e/l.png",
          allowedOrigins: [],
        },
        policies: [
          {
            id: "pol_x",
            version,
            name: "x",
            purpose: "",
            applicationId: null,
            query: { age: { gte: 18 } },
          },
        ],
      })
      const zk = new ZkPassportVerifier("localhost")
      const builder = await zk.request({})
      expect(() => builder.policy("pol_x")).toThrow(/Invalid policy/)
    }
  })

  test("policy with empty branding falls back to defaults (domain / generic purpose)", async () => {
    mockFetchReturning({
      app: { name: "", domain: "localhost", logoUrl: null, allowedOrigins: [] },
      policies: [
        {
          id: "pol_blank",
          version: 1,
          name: "blank",
          purpose: "",
          applicationId: null,
          query: { age: { gte: 18 } },
        },
      ],
    })

    const queryBuilder = (await zkPassport.request({})).policy("pol_blank")
    const result = queryBuilder.done()
    const servicePart = result.url.split("s=")[1].split("&")[0]
    const service = JSON.parse(Buffer.from(servicePart, "base64").toString())
    expect(service.name).toBe("localhost")
    expect(service.logo).toBe("")
    expect(service.purpose).toBe("Verify identity privately")
    expect(service.scope).toBe("pol_blank:1")
  })

  test("self-serve callers benefit from dashboard branding when the domain is registered", async () => {
    // No name/logo passed; the dashboard branding fills them in. (Purpose still
    // comes from the caller — there's no domain-level default purpose.)
    const queryBuilder = await zkPassport.request({ purpose: "Custom purpose" })
    const result = queryBuilder.done()

    const servicePart = result.url.split("s=")[1].split("&")[0]
    const service = JSON.parse(Buffer.from(servicePart, "base64").toString())
    expect(service.name).toBe("Dashboard Brand")
    expect(service.logo).toBe("https://dashboard.example/logo.png")
    expect(service.purpose).toBe("Custom purpose")
    expect(result.policy).toBeUndefined()
    expect(fetchCount).toBe(1)
  })

  test("self-serve tolerates a failing dashboard fetch silently", async () => {
    mockFetchReturning({}, 404)
    const queryBuilder = await zkPassport.request({
      name: "Self",
      logo: "https://e/l.png",
      purpose: "p",
    })
    expect(() => queryBuilder.done()).not.toThrow()
  })

  test("a failed fetch is retried on the next request() call", async () => {
    // First request fails — the cached promise must be cleared on failure
    // so the next request() retries instead of replaying the error.
    globalThis.fetch = (async () => {
      throw new TypeError("network down")
    }) as unknown as typeof globalThis.fetch
    await zkPassport.request({ name: "Self", logo: "https://e/l.png", purpose: "p" })

    mockFetchReturning(sampleConfig)
    const builder = await zkPassport.request({})
    const result = builder.policy("pol_xyz").done()
    expect(result.policy).toBe("pol_xyz")
  })
})
