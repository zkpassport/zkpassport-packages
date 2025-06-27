import { cidv0ToHex, hexToCidv0 } from "./cid"

const TEST_CID = "QmRk1rduJvo5DfEYAaLobS2za9tDszk35hzaNSDCJ74DA7"
const TEST_CID_HEX = "0x328F549938F9CA71D855F81335F36DAFA2A8BA0E8EC8595C583E08E2F70995F8"

describe("CIDv0 conversion utilities", () => {
  test("should convert CIDv0 to hex and back", () => {
    const hex = cidv0ToHex(TEST_CID)
    expect(hex).toBe(TEST_CID_HEX)

    const cid = hexToCidv0(hex)
    expect(cid).toBe(TEST_CID)
  })
})
