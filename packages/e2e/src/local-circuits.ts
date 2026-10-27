import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { CircuitManifest } from "@zkpassport/utils"

export type LocalCircuits = {
  version: string
  /** The local file for a circuits CDN URL, or undefined for any other URL */
  serve: (url: string) => Response | undefined
}

/**
 * Serve the circuits packaged in `dir` at `circuitUrl`, a network's circuits CDN. `dir` is the
 * circuits repo's target/packaged: a manifest.json and a circuits/ directory.
 */
export function loadLocalCircuits(dir: string, circuitUrl: string): LocalCircuits {
  const manifestPath = join(dir, "manifest.json")
  const manifest: CircuitManifest = JSON.parse(readFileSync(manifestPath, "utf8"))

  const files = new Map([
    [`${circuitUrl}/by-version/${manifest.version}/manifest.json`, manifestPath],
    ...Object.entries(manifest.circuits).map(
      ([name, { hash }]) =>
        [`${circuitUrl}/by-hash/${hash}.json`, join(dir, "circuits", `${name}.json`)] as const,
    ),
  ])

  return {
    version: manifest.version,
    serve: (url) => {
      const path = files.get(url)
      return path ? new Response(Bun.file(path)) : undefined
    },
  }
}
