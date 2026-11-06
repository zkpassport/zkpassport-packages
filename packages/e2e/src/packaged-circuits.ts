import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import type { CircuitManifest, PackagedCircuit } from "@zkpassport/utils"
import type { Hex } from "viem"

export type PackagedCircuits = {
  manifest: CircuitManifest
  circuits: PackagedCircuit[]
}

/** The deployable bytecode of the Solidity verifier for an outer EVM circuit */
export type OuterEvmVerifier = { vkeyHash: Hex; bytecode: Hex }

const OUTER_EVM_CIRCUIT_PREFIX = "outer_evm_count_"

/**
 * Load the circuits packaged in `dir`, the circuits repo's target/packaged: a manifest.json and a
 * circuits/ directory.
 */
export function loadPackagedCircuits(dir: string): PackagedCircuits {
  const circuitsDir = join(dir, "circuits")
  return {
    manifest: readJson(join(dir, "manifest.json")),
    circuits: readdirSync(circuitsDir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJson(join(circuitsDir, file))),
  }
}

/** Answer requests to the circuits CDN at `circuitUrl` with the given manifest and circuits */
export function serveCircuits(
  { manifest, circuits }: PackagedCircuits,
  circuitUrl: string,
): (url: string) => Response | undefined {
  const bodies = new Map<string, object>([
    [`${circuitUrl}/by-version/${manifest.version}/manifest.json`, manifest],
    ...circuits.map(
      (circuit) => [`${circuitUrl}/by-hash/${circuit.vkey_hash}.json`, circuit] as const,
    ),
  ])

  return (url) => {
    const body = bodies.get(url)
    return body ? Response.json(body) : undefined
  }
}

/**
 * Compile the Solidity verifier of each outer EVM circuit packaged in `dir`, from the circuits
 * checkout `dir` was packaged in: `src/solidity/src/ultra-honk-verifiers/OuterCount<N>.sol` for
 * `outer_evm_count_<N>`, with that Foundry project's settings.
 */
export function compileOuterEvmVerifiers(
  dir: string,
  { circuits }: PackagedCircuits,
): OuterEvmVerifier[] {
  const solidityDir = resolve(dir, "../../src/solidity")
  const outerEvmCircuits = circuits.filter((circuit) =>
    circuit.name.startsWith(OUTER_EVM_CIRCUIT_PREFIX),
  )
  const contractFile = (circuit: PackagedCircuit) =>
    `OuterCount${circuit.name.slice(OUTER_EVM_CIRCUIT_PREFIX.length)}.sol`
  // forge build without paths would build the whole project
  if (outerEvmCircuits.length === 0) {
    return []
  }

  // Build outside the checkout so it is left as it was
  const buildDir = mkdtempSync(join(tmpdir(), "e2e-outer-evm-verifiers-"))
  try {
    const forge = spawnSync(
      "forge",
      [
        "build",
        "--root",
        solidityDir,
        "--out",
        join(buildDir, "out"),
        "--cache-path",
        join(buildDir, "cache"),
        ...outerEvmCircuits.map((circuit) =>
          join(solidityDir, "src/ultra-honk-verifiers", contractFile(circuit)),
        ),
      ],
      { encoding: "utf8" },
    )
    if (forge.status !== 0) {
      throw new Error(`forge build in ${solidityDir} failed:\n${forge.stdout}${forge.stderr}`)
    }

    return outerEvmCircuits.map((circuit) => ({
      vkeyHash: circuit.vkey_hash as Hex,
      bytecode: readJson<{ bytecode: { object: Hex } }>(
        join(buildDir, "out", contractFile(circuit), "HonkVerifier.json"),
      ).bytecode.object,
    }))
  } finally {
    rmSync(buildDir, { recursive: true, force: true })
  }
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8"))
}
