import { QueryBuilder, ZKPassport as ZkPassportVerifier } from "../src/index"
import { MockWebSocket } from "./helpers/mock-websocket"

describe("Query Builder", () => {
  let zkPassport: ZkPassportVerifier
  let queryBuilder: QueryBuilder

  beforeEach(async () => {
    // Clear any previous mock states
    MockWebSocket.clearHub()

    zkPassport = new ZkPassportVerifier("localhost")
    queryBuilder = await zkPassport.request({
      name: "Test App",
      logo: "https://test.com/logo.png",
      purpose: "Testing query builder",
    })
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

  test("should build sanctions query for single country", async () => {
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
  })

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
