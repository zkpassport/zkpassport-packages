import { cidToHex, hexToCid } from "./cid"

const TEST_BASE32_CID_1 = "bafkreih2nqzzw4p3akbq5jj3iqdod6mrdtyjklpoogu3cmoh2bhrssgffi"
const TEST_HEX_CID_1 = "0xfa6c339b71fb02830ea53b4406e1f9911cf0952dee71a9b131c7d04f1948c52a"
const TEST_BASE32_CID_2 = "bafkreiah6km7qxofaj4ctvysuikxn4q4egz52iiq2e7vuw5z542ugmx5jq"
const TEST_HEX_CID_2 = "0x07f299f85dc5027829d712a21576f21c21b3dd2110d13f5a5bb9ef354332fd4c"

describe("CIDv1 conversion utilities", () => {
  test("should convert CIDv1 to hex", () => {
    const hex = cidToHex(TEST_BASE32_CID_1)
    expect(hex).toBe(TEST_HEX_CID_1)
    const hex2 = cidToHex(TEST_BASE32_CID_2)
    expect(hex2).toBe(TEST_HEX_CID_2)
  })

  test("should convert hex to CIDv1", () => {
    const cid = hexToCid(TEST_HEX_CID_1)
    expect(cid).toBe(TEST_BASE32_CID_1)
    const cid2 = hexToCid(TEST_HEX_CID_2)
    expect(cid2).toBe(TEST_BASE32_CID_2)
  })

  test("should throw error for invalid CID format", () => {
    expect(() => cidToHex("invalid-cid")).toThrow("Invalid CID format")
    expect(() => cidToHex("QmInvalidCIDv0")).toThrow("Invalid CID format")
  })

  test("should throw error for invalid hex string", () => {
    expect(() => hexToCid("not-a-hex")).toThrow("Invalid hex string format")
    expect(() => hexToCid("0xZZZ")).toThrow("Invalid hex string format")
  })
})
