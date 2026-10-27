import { bytes32ToCircuitVersion, circuitVersionToBytes32 } from "./circuits"

const VERSION_1_258_4660_KEY = `0x000101021234${"0".repeat(52)}`
const LARGEST_VERSION_KEY = "0xffffffffffff0000000000000000000000000000000000000000000000000000"

describe("circuitVersionToBytes32", () => {
  test("encodes major, minor and patch as 2-byte big-endian integers followed by zero bytes", () => {
    expect(circuitVersionToBytes32("1.258.4660")).toBe(VERSION_1_258_4660_KEY)
  })

  test("encodes parts up to 65535", () => {
    expect(circuitVersionToBytes32("65535.65535.65535")).toBe(LARGEST_VERSION_KEY)
  })

  test("rejects anything but MAJOR.MINOR.PATCH with parts from 0 to 65535", () => {
    const malformedVersions = [
      "",
      "0.21",
      "0.21.1.0",
      "v0.21.1",
      "0.22.0-rc.1",
      "0.21.1+build",
      " 0.21.1",
      "0.021.1",
      "0.21.-1",
      "0.21.65536",
    ]

    for (const version of malformedVersions) {
      expect(() => circuitVersionToBytes32(version)).toThrow("expected MAJOR.MINOR.PATCH")
    }
  })

  test("rejects 0.0.0, whose key would be zero", () => {
    expect(() => circuitVersionToBytes32("0.0.0")).toThrow("its RootVerifier key would be zero")
  })
})

describe("bytes32ToCircuitVersion", () => {
  test("decodes major, minor and patch from the key's first three 2-byte big-endian integers", () => {
    expect(bytes32ToCircuitVersion(VERSION_1_258_4660_KEY)).toBe("1.258.4660")
  })

  test("decodes parts up to 65535, in either case", () => {
    expect(bytes32ToCircuitVersion(LARGEST_VERSION_KEY)).toBe("65535.65535.65535")
    expect(bytes32ToCircuitVersion(LARGEST_VERSION_KEY.replace(/f/g, "F"))).toBe(
      "65535.65535.65535",
    )
  })

  test("rejects the zero key, non-zero trailing bytes and anything but 32 bytes of hex", () => {
    const malformedKeys = [
      `0x${"0".repeat(64)}`,
      `0x000000150001${"0".repeat(51)}1`,
      `0x000000150001${"0".repeat(50)}`,
      `0x000000150001${"0".repeat(54)}`,
      `000000150001${"0".repeat(52)}`,
      `0x00000015000g${"0".repeat(52)}`,
    ]

    for (const key of malformedKeys) {
      expect(() => bytes32ToCircuitVersion(key)).toThrow("Invalid circuits version key")
    }
  })
})
