import { getBBWasmHashConfigKey } from "./bb-wasm"

const BB_6_THREADED_WASM_KEY = "0x70e3204ade0fc622cdac4f9d0cf471c534bf3f0b0d2c76a92dbbe2a40f8d001e"
const BB_6_SINGLE_THREADED_WASM_KEY =
  "0xec4b7eee55589d204c67d40892f8c1316387f7396dc8934146775da8bdc492ba"

describe("getBBWasmHashConfigKey", () => {
  test("is keccak256 of ZKPASSPORT::BB_WASM_SHA256::<bb version>::<wasm file>", () => {
    expect(getBBWasmHashConfigKey("6.0.0", "barretenberg-threads.wasm")).toBe(
      BB_6_THREADED_WASM_KEY,
    )
    expect(getBBWasmHashConfigKey("6.0.0", "barretenberg.wasm")).toBe(BB_6_SINGLE_THREADED_WASM_KEY)
  })
})
