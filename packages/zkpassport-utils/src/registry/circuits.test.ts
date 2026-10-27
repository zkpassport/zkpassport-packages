import { bytes32ToCircuitVersion, circuitVersionToBytes32 } from "./circuits"

// Every version registered on the Ethereum RootVerifier, with the key it is registered under
const REGISTERED_VERSION_KEYS = {
  "0.14.1": "0x0000000e00010000000000000000000000000000000000000000000000000000",
  "0.15.0": "0x0000000f00000000000000000000000000000000000000000000000000000000",
  "0.15.1": "0x0000000f00010000000000000000000000000000000000000000000000000000",
  "0.16.0": "0x0000001000000000000000000000000000000000000000000000000000000000",
  "0.17.1": "0x0000001100010000000000000000000000000000000000000000000000000000",
  "0.18.0": "0x0000001200000000000000000000000000000000000000000000000000000000",
  "0.19.0": "0x0000001300000000000000000000000000000000000000000000000000000000",
  "0.20.0": "0x0000001400000000000000000000000000000000000000000000000000000000",
  "0.21.0": "0x0000001500000000000000000000000000000000000000000000000000000000",
  "0.21.1": "0x0000001500010000000000000000000000000000000000000000000000000000",
}
const LARGEST_VERSION_KEY = "0xffffffffffff0000000000000000000000000000000000000000000000000000"

describe("circuitVersionToBytes32", () => {
  test("encodes every registered version to its registered key", () => {
    for (const [version, key] of Object.entries(REGISTERED_VERSION_KEYS)) {
      expect(circuitVersionToBytes32(version)).toBe(key)
    }
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
  test("decodes every registered key to its version", () => {
    for (const [version, key] of Object.entries(REGISTERED_VERSION_KEYS)) {
      expect(bytes32ToCircuitVersion(key)).toBe(version)
    }
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
