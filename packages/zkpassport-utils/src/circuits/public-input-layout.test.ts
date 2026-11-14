import { describe, expect, it } from "bun:test"
import {
  getAttestedIdTrailingOutput,
  getOuterTrailingInput,
  outerTrailingStart,
} from "./public-input-layout"

// 5 header inputs, two param commitments, then the trailing inputs
const header = ["root", "circuits", "date", "scope", "subscope"]
const commitments = ["c1", "c2"]

describe("public input layout", () => {
  it("reads an outer proof's trailing inputs by name, with the credential scheme", () => {
    const inputs = [...header, ...commitments, "type", "nullifier", "oprf", "scheme"]
    expect(getOuterTrailingInput(inputs, "nullifier_type", true)).toBe("type")
    expect(getOuterTrailingInput(inputs, "scoped_nullifier", true)).toBe("nullifier")
    expect(getOuterTrailingInput(inputs, "oprf_pk_hash", true)).toBe("oprf")
    expect(getOuterTrailingInput(inputs, "credential_scheme", true)).toBe("scheme")
    expect(inputs.slice(5, outerTrailingStart(inputs, true))).toEqual(commitments)
  })

  it("reads the layout from before the credential scheme", () => {
    const inputs = [...header, ...commitments, "type", "nullifier", "oprf"]
    expect(getOuterTrailingInput(inputs, "nullifier_type", false)).toBe("type")
    expect(getOuterTrailingInput(inputs, "oprf_pk_hash", false)).toBe("oprf")
    expect(inputs.slice(5, outerTrailingStart(inputs, false))).toEqual(commitments)
    expect(() => getOuterTrailingInput(inputs, "credential_scheme", false)).toThrow(
      "no credential_scheme",
    )
  })

  it("reads an attested ID proof's last outputs, and refuses too few inputs", () => {
    expect(getAttestedIdTrailingOutput(["a", "b", "commitment", "200"], "param_commitment")).toBe(
      "commitment",
    )
    expect(getAttestedIdTrailingOutput(["a", "commitment", "200"], "credential_scheme")).toBe("200")
    expect(() => getAttestedIdTrailingOutput(["200"], "param_commitment")).toThrow("Too few")
  })
})
