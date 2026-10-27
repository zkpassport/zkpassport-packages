import { describe, expect, test } from "bun:test"
import { getBBVersionForCircuitVersion } from "./bb-verifier"

describe("getBBVersionForCircuitVersion", () => {
  test("picks the bb version each circuit release was built with", () => {
    expect(getBBVersionForCircuitVersion("0.19.0")).toBe("v4")
    expect(getBBVersionForCircuitVersion("0.20.0")).toBe("v5")
    expect(getBBVersionForCircuitVersion("0.21.1")).toBe("v5")
    expect(getBBVersionForCircuitVersion("0.22.0")).toBe("v6")
  })

  test("picks the newest bb version for later releases", () => {
    expect(getBBVersionForCircuitVersion("0.22.3")).toBe("v6")
    expect(getBBVersionForCircuitVersion("0.23.0")).toBe("v6")
    expect(getBBVersionForCircuitVersion("1.0.0")).toBe("v6")
  })

  test("picks the newest bb version when the circuit version is missing or malformed", () => {
    expect(getBBVersionForCircuitVersion(undefined)).toBe("v6")
    expect(getBBVersionForCircuitVersion("0.22")).toBe("v6")
    expect(getBBVersionForCircuitVersion("latest")).toBe("v6")
  })
})
