import { describe, expect, test } from "bun:test"
import { checkBasicAuth } from "../lib/basic-auth"

const CREDENTIALS = "demo:hunter2"
const VALID_HEADER = `Basic ${btoa(CREDENTIALS)}`

describe("checkBasicAuth", () => {
  test("allows every request when no credentials are configured", () => {
    expect(checkBasicAuth(null, undefined)).toBe(true)
    expect(checkBasicAuth(null, "")).toBe(true)
    expect(checkBasicAuth(VALID_HEADER, undefined)).toBe(true)
  })

  test("allows a request with the matching header", () => {
    expect(checkBasicAuth(VALID_HEADER, CREDENTIALS)).toBe(true)
  })

  test("accepts a case-insensitive scheme", () => {
    expect(checkBasicAuth(`basic ${btoa(CREDENTIALS)}`, CREDENTIALS)).toBe(true)
  })

  test("rejects a missing header", () => {
    expect(checkBasicAuth(null, CREDENTIALS)).toBe(false)
  })

  test("rejects wrong credentials", () => {
    expect(checkBasicAuth(`Basic ${btoa("demo:wrong")}`, CREDENTIALS)).toBe(false)
  })

  test("rejects a non-basic scheme", () => {
    expect(checkBasicAuth(`Bearer ${btoa(CREDENTIALS)}`, CREDENTIALS)).toBe(false)
  })

  test("rejects a malformed header", () => {
    expect(checkBasicAuth("Basic", CREDENTIALS)).toBe(false)
    expect(checkBasicAuth("not-a-header", CREDENTIALS)).toBe(false)
  })
})
