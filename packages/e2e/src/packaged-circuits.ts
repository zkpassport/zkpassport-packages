import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { CircuitManifest, PackagedCircuit } from "@zkpassport/utils"

export type PackagedCircuits = {
  manifest: CircuitManifest
  circuits: PackagedCircuit[]
}

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

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8"))
}
