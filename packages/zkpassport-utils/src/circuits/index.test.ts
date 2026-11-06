import { getDisclosureCircuitName } from "."

describe("getDisclosureCircuitName", () => {
  test("names the standard disclosure circuit", () => {
    expect(getDisclosureCircuitName("compare_age")).toEqual("compare_age")
    expect(getDisclosureCircuitName("compare_age", { evm: false })).toEqual("compare_age")
  })

  test("names the EVM variant", () => {
    expect(getDisclosureCircuitName("compare_age", { evm: true })).toEqual("compare_age_evm")
    expect(getDisclosureCircuitName("exclusion_check_sanctions", { evm: true })).toEqual(
      "exclusion_check_sanctions_evm",
    )
  })
})
