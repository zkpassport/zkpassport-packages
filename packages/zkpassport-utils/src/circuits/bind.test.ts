import { describe, expect, test } from "bun:test"
import { BoundDataIdentifier, formatBoundData } from "./bind"

const userAddress = `0x${"ab".repeat(32)}`
const userAddressEntry = [BoundDataIdentifier.USER_ADDRESS, 0, 32, ...Array(32).fill(0xab)]

describe("formatBoundData", () => {
  test("writes an Aztec network's rollup version as its chain id", () => {
    const testnetData = formatBoundData({ user_address: userAddress, chain: "aztec_testnet" })
    const mainnetData = formatBoundData({ user_address: userAddress, chain: "aztec" })

    expect(testnetData).toEqual([
      ...userAddressEntry,
      ...[BoundDataIdentifier.CHAIN_ID, 0, 4, 0x28, 0x7c, 0xb6, 0x46],
    ])
    expect(mainnetData).toEqual([
      ...userAddressEntry,
      ...[BoundDataIdentifier.CHAIN_ID, 0, 4, 0x7b, 0x6e, 0xd2, 0x98],
    ])
  })

  test("writes an EVM chain as its chain id", () => {
    const data = formatBoundData({ user_address: userAddress, chain: "base" })

    expect(data).toEqual([...userAddressEntry, BoundDataIdentifier.CHAIN_ID, 0, 2, 0x21, 0x05])
  })
})
