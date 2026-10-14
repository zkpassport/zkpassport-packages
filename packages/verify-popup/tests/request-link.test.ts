import { describe, expect, test } from "bun:test"
import { parseVerifyRequest } from "../src/r/request-link"

describe("parseVerifyRequest", () => {
  test("rejects a link that carries no request", () => {
    expect(parseVerifyRequest("")).toBeNull()
    expect(parseVerifyRequest("?d=example.com&s=abc")).toBeNull()
  })

  test("reads the domain and the base64 service name", () => {
    const service = btoa(JSON.stringify({ name: "Acme" }))
    expect(parseVerifyRequest(`?t=abc&p=1&d=example.com&s=${encodeURIComponent(service)}`)).toEqual(
      { serviceName: "Acme", domain: "example.com" },
    )
  })

  test("recovers a service name whose base64 contains a plus", () => {
    expect(parseVerifyRequest("?t=abc&p=1&s=eyJuYW1lIjoiQWN+In0=")?.serviceName).toBe("Ac~")
  })

  test("falls back to no name when the service param is unreadable", () => {
    expect(parseVerifyRequest("?t=abc&p=1&s=not-base64!!")?.serviceName).toBeNull()
    expect(parseVerifyRequest(`?t=abc&p=1&s=${btoa("{}")}`)?.serviceName).toBeNull()
  })
})
