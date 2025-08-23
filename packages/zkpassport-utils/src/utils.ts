import { bigIntToBuffer } from "@zk-kit/utils"
import { QueryResult, SupportedChain } from "./types"

export async function loadModule(module: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(module)
  } catch {
    return undefined
  }
}

/**
 * Convert a little-endian buffer into a BigInt.
 * @param buf - The little-endian buffer to convert.
 * @returns A BigInt with the little-endian representation of buf.
 */
export function toBigIntLE(buf: Buffer): bigint {
  const reversed = buf
  reversed.reverse()
  const hex = reversed.toString("hex")
  if (hex.length === 0) {
    return BigInt(0)
  }
  return BigInt(`0x${hex}`)
}

/**
 * Convert a big-endian buffer into a BigInt.
 * @param buf - The big-endian buffer to convert.
 * @returns A BigInt with the big-endian representation of buf.
 */
export function toBigIntBE(buf: Buffer): bigint {
  const hex = buf.toString("hex")
  if (hex.length === 0) {
    return BigInt(0)
  }
  return BigInt(`0x${hex}`)
}

/**
 * Convert a BigInt to a little-endian buffer.
 * @param num - The BigInt to convert.
 * @param width - The number of bytes that the resulting buffer should be.
 * @returns A little-endian buffer representation of num.
 */
export function toBufferLE(num: bigint, width: number): Buffer {
  if (num < BigInt(0)) {
    throw new Error(`Cannot convert negative bigint ${num.toString()} to buffer with toBufferLE.`)
  }
  const hex = num.toString(16)
  const buffer = Buffer.from(hex.padStart(width * 2, "0").slice(0, width * 2), "hex")
  buffer.reverse()
  return buffer
}

/**
 * Convert a BigInt to a big-endian buffer.
 * @param num - The BigInt to convert.
 * @param width - The number of bytes that the resulting buffer should be.
 * @returns A big-endian buffer representation of num.
 */
export function toBufferBE(num: bigint, width: number): Buffer {
  if (num < BigInt(0)) {
    throw new Error(`Cannot convert negative bigint ${num.toString()} to buffer with toBufferBE.`)
  }
  const hex = num.toString(16)
  const buffer = Buffer.from(hex.padStart(width * 2, "0").slice(0, width * 2), "hex")
  if (buffer.length > width) {
    throw new Error(`Number ${num.toString(16)} does not fit in ${width}`)
  }
  return buffer
}

/**
 * Converts a BigInt to its hex representation.
 * @param num - The BigInt to convert.
 * @param padTo32 - Whether to pad the resulting string to 32 bytes.
 * @returns An even-length 0x-prefixed string.
 */
export function toHex(num: bigint, padTo32 = false): `0x${string}` {
  const str = num.toString(16)
  const targetLen = str.length % 2 === 0 ? str.length : str.length + 1
  const paddedStr = str.padStart(padTo32 ? 64 : targetLen, "0")
  return `0x${paddedStr}`
}

/**
 * Converts a hex string to a buffer. Throws if input is not a valid hex string.
 * @param value - The hex string to convert. May be 0x prefixed or not.
 * @returns A buffer.
 */
export function fromHex(value: string): Buffer {
  const hexRegex = /^(0x)?[0-9a-fA-F]*$/
  if (!hexRegex.test(value) || value.length % 2 !== 0) {
    throw new Error(`Invalid hex string: ${value}`)
  }
  return Buffer.from(value.replace(/^0x/i, ""), "hex")
}

/**
 * Strips the '0x' prefix from a hexadecimal string.
 * @param input - The input string.
 * @returns The input string without the '0x' prefix.
 */
export function strip0x(input: string): string {
  return input.startsWith("0x") ? input.slice(2) : input
}

/**
 * Normalise a hex string or bigint into a 0x-prefixed even 0-padded hex string
 * @param hex - The hex string or bigint to normalise
 * @returns A normalised hex string, e.g. 0x0123
 */
export function normaliseHex(hex: string | bigint): string {
  const hexInput = typeof hex === "bigint" ? hex.toString(16) : hex
  // Output 0x-prefixed even 0-padded hex string
  return `0x${hexInput.toLowerCase().padStart(hexInput.length % 2 ? hexInput.length + 1 : hexInput.length, "0")}`
}

export function fromBytesToBigInt(bytes: number[]): bigint {
  return BigInt("0x" + Buffer.from(bytes).toString("hex"))
}

export function fromArrayBufferToBigInt(buffer: ArrayBuffer): bigint {
  return BigInt("0x" + Buffer.from(buffer).toString("hex"))
}

export function rightPadArrayWithZeros(array: number[], length: number): number[] {
  return array.concat(Array(length - array.length).fill(0))
}

export function rightPadCountryCodeArray(array: string[], length: number): string[] {
  return array.concat(Array(length - array.length).fill("\u0000\u0000\u0000"))
}

export function leftPadArrayWithZeros(array: number[], length: number): number[] {
  return Array(length - array.length)
    .fill(0)
    .concat(array)
}

export function getBitSize(number: number | string | bigint): number {
  return number.toString(2).length
}

export function getOffsetInArray(
  array: any[],
  arrayToFind: any[],
  startPosition: number = 0,
): number {
  for (let i = startPosition; i < array.length; i++) {
    if (array.slice(i, i + arrayToFind.length).every((val, index) => val === arrayToFind[index])) {
      return i
    }
  }
  return -1
}

export function bigintToBytes(value: bigint): number[] {
  return Array.from(bigIntToBuffer(value))
}

export function bigintToNumber(value: bigint): number {
  return Number(value)
}

export function assert(truthy: boolean, errorMsg: string): void {
  if (!truthy) {
    throw new Error(errorMsg)
  }
}

export function packBeBytesIntoField(x: Uint8Array, maxFieldSize: number): bigint {
  let result: bigint = BigInt(0)
  for (let i = 0; i < maxFieldSize; i++) {
    result *= BigInt(256)
    result += BigInt(x[i])
  }
  return result
}

/**
 * Packs bytes into field elements using big-endian encoding, matching the Noir pack_be_bytes_into_fields function
 * Note: A 254 bit field can hold up to 31 bytes
 */
export function packBeBytesIntoFields(bytes: Uint8Array, maxChunkSize: number): string[] {
  if (bytes.length === 0) return []
  const totalFields = Math.ceil(bytes.length / maxChunkSize)
  const result = new Array(totalFields)
  // Calculate size of first chunk (might be smaller than maxChunkSize)
  const firstChunkSize = bytes.length % maxChunkSize || maxChunkSize
  let byteIndex = 0
  for (let fieldIndex = totalFields - 1; fieldIndex >= 0; fieldIndex--) {
    const chunkSize = fieldIndex === totalFields - 1 ? firstChunkSize : maxChunkSize
    let value = 0n
    for (let i = 0; i < chunkSize; i++) {
      value = (value << 8n) | BigInt(bytes[byteIndex++])
    }
    const hex = value.toString(16)
    result[fieldIndex] = "0x" + (hex.length % 2 ? "0" : "") + hex
  }
  return result
}

/**
 * Converts a string (or string array) into a hex string array
 * Useful for going from text to unicode
 * @param str
 * @returns
 */
export function stringToAsciiStringArray(str: string): string[] {
  const asciiStringArray = []
  for (let i = 0; i < str.length; i++) {
    asciiStringArray.push(BigInt(str.charCodeAt(i)))
  }
  return asciiStringArray.map((b) => `0x${b.toString(16)}`)
}

export function getIdFromChain(chain: SupportedChain): number {
  if (chain === "ethereum_sepolia") {
    return 11155111
  } else if (chain === "local_anvil") {
    return 31337
  }
  throw new Error(`Unsupported chain: ${chain}`)
}

export function getChainFromId(chainId: number): SupportedChain {
  if (chainId === 11155111) {
    return "ethereum_sepolia"
  } else if (chainId === 31337) {
    return "local_anvil"
  }
  throw new Error(`Unsupported chain ID: ${chainId}`)
}

export function getChainDisplayName(chain: SupportedChain): string {
  if (chain === "ethereum_sepolia") {
    return "Ethereum Sepolia"
  } else if (chain === "local_anvil") {
    return "Anvil (local)"
  }
  throw new Error(`Unsupported chain: ${chain}`)
}

export function areDatesEqual(date1: Date | string | number, date2: Date | string | number) {
  if (typeof date1 === "string" || typeof date1 === "number") {
    date1 = new Date(date1)
  }
  if (typeof date2 === "string" || typeof date2 === "number") {
    date2 = new Date(date2)
  }
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  )
}

export function formatDate(date: Date | string | number) {
  if (typeof date === "string" || typeof date === "number") {
    return new Date(date)
  }
  return date
}

export function getUnixTimestamp(date: Date | string | number): number {
  if (typeof date === "string" || typeof date === "number") {
    return Math.floor(new Date(date).getTime() / 1000)
  }
  return Math.floor(date.getTime() / 1000)
}

export function getTodayTimestamp(): number {
  const today = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
    0,
    0,
    0,
    0,
  )

  return Math.floor(today / 1000)
}

export function getNowTimestamp(): number {
  const now = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
    new Date().getUTCHours(),
    new Date().getUTCMinutes(),
    new Date().getUTCSeconds(),
  )
  return Math.floor(now / 1000)
}

export function formatQueryResultDates(queryResult: QueryResult) {
  // Iterate over the query result and format the dates
  for (const key in queryResult) {
    const value = queryResult[key as keyof QueryResult]

    // Only format dates for birthdate and expiry_date credentials
    if ((key === "birthdate" || key === "expiry_date") && value && typeof value === "object") {
      // Handle eq.expected
      if ("eq" in value && value.eq) {
        value.eq.expected = formatDate(value.eq.expected) as any
      }

      // Handle gte.expected
      if ("gte" in value && value.gte) {
        value.gte.expected = formatDate(value.gte.expected) as any
      }

      // Handle gt.expected
      if ("gt" in value && value.gt) {
        value.gt.expected = formatDate(value.gt.expected) as any
      }

      // Handle lte.expected
      if ("lte" in value && value.lte) {
        value.lte.expected = formatDate(value.lte.expected) as any
      }

      // Handle lt.expected
      if ("lt" in value && value.lt) {
        value.lt.expected = formatDate(value.lt.expected) as any
      }

      // Handle range.expected
      if ("range" in value && value.range && Array.isArray(value.range.expected)) {
        const [start, end] = value.range.expected
        value.range.expected = [formatDate(start), formatDate(end)] as any
      }

      // Handle disclose.result
      if ("disclose" in value && value.disclose) {
        value.disclose.result = formatDate(value.disclose.result) as any
      }
    }
  }
  return queryResult
}

export { AggregateError, PromisePool } from "./promise-pool"
