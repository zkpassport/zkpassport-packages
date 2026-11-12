import { describe, expect, test } from "bun:test"
import { BoundDataIdentifier, formatBoundData } from "./bind"

const userAddress = `0x${"ab".repeat(32)}`
const userAddressEntry = [BoundDataIdentifier.USER_ADDRESS, 0, 32, ...Array(32).fill(0xab)]

describe("formatBoundData", () => {
  test("writes an Aztec testnet as its L1 chain id and rollup version, 32 bytes each", () => {
    const data = formatBoundData({ user_address: userAddress, chain: "aztec_testnet" })

    expect(data).toEqual([
      ...userAddressEntry,
      BoundDataIdentifier.AZTEC_NETWORK,
      0,
      64,
      ...Array(29).fill(0),
      ...[0xaa, 0x36, 0xa7],
      ...Array(28).fill(0),
      ...[0x28, 0x7c, 0xb6, 0x46],
    ])
  })

  test("writes Aztec mainnet as its L1 chain id and rollup version, 32 bytes each", () => {
    const data = formatBoundData({ user_address: userAddress, chain: "aztec" })

    expect(data).toEqual([
      ...userAddressEntry,
      BoundDataIdentifier.AZTEC_NETWORK,
      0,
      64,
      ...Array(31).fill(0),
      0x01,
      ...Array(28).fill(0),
      ...[0x7b, 0x6e, 0xd2, 0x98],
    ])
  })

  test("writes an EVM chain as its chain id", () => {
    const data = formatBoundData({ user_address: userAddress, chain: "base" })

    expect(data).toEqual([...userAddressEntry, BoundDataIdentifier.CHAIN_ID, 0, 2, 0x21, 0x05])
  })
})
