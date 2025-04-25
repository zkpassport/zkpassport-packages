import { cidToHex, hexToCid } from "./cid"

const TEST_CID_BASE32_RAW = "bafkreiavmwjivt47xawnkvmxp3fkaod6onmkqfb2lhxhv44rfoqgsmxm2u"
const TEST_CID_BASE32_DAG_PB = "bafybeiavmwjivt47xawnkvmxp3fkaod6onmkqfb2lhxhv44rfoqgsmxm2u"
const TEST_CID_HEX = "0x1565928acf9fb82cd555977ecaa0387e7358a8143a59ee7af3912ba06932ecd5"

describe("CIDv1 conversion utilities", () => {
  test("should convert CIDv1 to hex and back", () => {
    const hex1 = cidToHex(TEST_CID_BASE32_RAW)
    const hex2 = cidToHex(TEST_CID_BASE32_DAG_PB)
    expect(hex1).toBe(hex2)
    expect(hex1).toBe(TEST_CID_HEX)
    expect(hex2).toBe(TEST_CID_HEX)
    const cidRaw = hexToCid(hex1, "raw")
    expect(cidRaw).toBe(TEST_CID_BASE32_RAW)
    const cidDagPb = hexToCid(hex2)
    expect(cidDagPb).toBe(TEST_CID_BASE32_DAG_PB)
  })
})
