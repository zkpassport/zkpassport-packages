import { sha256 } from "@noble/hashes/sha2.js"
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js"
import type { RegistryClient } from "@zkpassport/registry"
import type { BBWasmFile } from "@zkpassport/utils/registry"
import { Buffer } from "buffer/"

/**
 * Get where bb.js can load a bb version's wasm from once it matches the sha256 the Root Registry
 * holds for it, or undefined, after logging why, when it cannot
 */
export async function loadBBWasm(
  bbVersion: string,
  registryClient: RegistryClient,
  writingDirectory: string | undefined,
): Promise<string | undefined> {
  const file = getWasmFileBBJsLoads()
  const registeredHash = await registryClient.getBBWasmHash(bbVersion, file)
  if (!registeredHash) {
    console.warn(`No sha256 is registered for bb ${bbVersion}'s ${file}`)
    return undefined
  }

  const url = registryClient.getUrlForBBWasm(bbVersion, file)
  if (typeof window === "undefined") {
    return loadInNode(url, registeredHash, bbVersion, file, writingDirectory)
  }

  if (!(await isFetchedWithIntegrity(url, registeredHash))) {
    return undefined
  }
  // Browser bb.js adds "-threads" to the file name it is given when it loads the threaded wasm
  return registryClient.getUrlForBBWasm(bbVersion, "barretenberg.wasm")
}

function getWasmFileBBJsLoads(): BBWasmFile {
  const isBrowser = typeof window !== "undefined"
  const isSharedMemoryAvailable =
    typeof SharedArrayBuffer !== "undefined" && globalThis.crossOriginIsolated === true

  return !isBrowser || isSharedMemoryAvailable ? "barretenberg-threads.wasm" : "barretenberg.wasm"
}

async function loadInNode(
  url: string,
  registeredHash: string,
  bbVersion: string,
  file: BBWasmFile,
  writingDirectory: string | undefined,
): Promise<string | undefined> {
  // Not imported, so browser bundlers never see Node's modules
  const { mkdir, readFile, writeFile } = process.getBuiltinModule("node:fs/promises")
  const { join } = process.getBuiltinModule("node:path")
  const { tmpdir } = process.getBuiltinModule("node:os")
  const directory = join(writingDirectory ?? tmpdir(), ".bb-wasm", bbVersion)
  const path = join(directory, file)

  const cachedWasm = await readFile(path).catch(() => undefined)
  if (cachedWasm && getSha256(cachedWasm) === registeredHash) {
    return path
  }

  const wasm = await download(url)
  if (!wasm) {
    return undefined
  }
  if (getSha256(wasm) !== registeredHash) {
    console.warn(`${url} does not match the sha256 registered for it`)
    return undefined
  }

  await mkdir(directory, { recursive: true })
  await writeFile(path, wasm)
  return path
}

async function isFetchedWithIntegrity(url: string, registeredHash: string): Promise<boolean> {
  const integrity = `sha256-${Buffer.from(hexToBytes(registeredHash.slice(2))).toString("base64")}`
  try {
    const response = await fetch(url, { integrity })
    if (!response.ok) {
      console.warn(`Error downloading ${url}: ${response.status} ${response.statusText}`)
      return false
    }
    await response.arrayBuffer()
    return true
  } catch (error) {
    console.warn(`Error downloading ${url}`, error)
    return false
  }
}

async function download(url: string): Promise<Uint8Array | undefined> {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      console.warn(`Error downloading ${url}: ${response.status} ${response.statusText}`)
      return undefined
    }
    return new Uint8Array(await response.arrayBuffer())
  } catch (error) {
    console.warn(`Error downloading ${url}`, error)
    return undefined
  }
}

function getSha256(bytes: Uint8Array): string {
  return `0x${bytesToHex(sha256(bytes))}`
}
