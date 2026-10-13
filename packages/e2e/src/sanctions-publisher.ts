/**
 * The sanctions publisher's CLI, `sanctions-pub`, run as a child process. It lives in a private
 * ZKPassport repo, so this package does not declare it: SANCTIONS_PUBLISHER_DIR points at the
 * publisher package of a checkout with its dependencies installed, and without it the sanctions
 * tests are skipped.
 */
import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { stripVTControlCharacters } from "node:util"
import { type ChainFork, ORACLE_PRIVATE_KEY } from "./chain-fork"

const PUBLISHER_DIR = process.env.SANCTIONS_PUBLISHER_DIR
  ? resolve(process.env.SANCTIONS_PUBLISHER_DIR)
  : undefined

/** Whether SANCTIONS_PUBLISHER_DIR points at the publisher package */
export function isSanctionsPublisherAvailable(): boolean {
  return PUBLISHER_DIR !== undefined && existsSync(join(PUBLISHER_DIR, "src/cli.ts"))
}

/** Download the day's build of every dataset into snapshotsDir, keeping builds already there */
export async function downloadOpenSanctions(snapshotsDir: string, date?: string): Promise<void> {
  await sanctionsPub([
    "oracle",
    "download-opensanctions",
    "-o",
    snapshotsDir,
    ...(date ? ["--date", date] : []),
  ])
}

export type PublishedSanctionsRoot = {
  root: string
  /** Every leaf, the snapshots they came from and the code that built them */
  packagedFile: string
  /** The tree's layers, as the publisher uploads them next to the packaged file */
  treeFile: string
  log: string
}

/**
 * Build the tree from the newest snapshot of every dataset and publish its root to the forked
 * Sepolia Sanctions Registry from the oracle key, as the scheduled job does on testnet:
 * `oracle process-and-package`, then `oracle publish`. The CDN and IPFS uploads in between are
 * left out; the fork's file server serves the tree instead.
 */
export async function publishSanctionsRoot({
  fork,
  snapshotsDir,
  workDir,
}: {
  fork: ChainFork
  snapshotsDir: string
  workDir: string
}): Promise<PublishedSanctionsRoot> {
  const env = { ETH_RPC_URL: fork.rpcUrl }
  const packagedFile = join(workDir, "packaged.json")
  const treesDir = join(workDir, "trees")

  const processLog = await sanctionsPub(
    [
      "oracle",
      "process-and-package",
      "--testnet",
      "--sources-dir",
      snapshotsDir,
      "--trees-dir",
      treesDir,
      "--fail-if-already-latest-root",
      packagedFile,
    ],
    env,
  )
  const { root } = JSON.parse(readFileSync(packagedFile, "utf8")) as { root: string }

  const publishLog = await sanctionsPub(
    ["oracle", "publish", packagedFile, "--testnet", "--skip-confirm"],
    { ...env, ORACLE_PRIVATE_KEY },
  )

  return {
    root,
    packagedFile,
    treeFile: join(treesDir, "testnet", `${root}.tree.json`),
    log: processLog + publishLog,
  }
}

/** Run one `sanctions-pub` command and return its output; throw with that output if it fails */
async function sanctionsPub(args: string[], env: Record<string, string> = {}): Promise<string> {
  if (!PUBLISHER_DIR) {
    throw new Error("SANCTIONS_PUBLISHER_DIR is not set")
  }

  const child = Bun.spawn(["bun", "src/cli.ts", ...args], {
    cwd: PUBLISHER_DIR,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])

  // The CLI colours its output whatever the terminal
  const output = stripVTControlCharacters(stdout + stderr)
  if (exitCode !== 0) {
    throw new Error(`sanctions-pub ${args.join(" ")} exited with ${exitCode}:\n${output}`)
  }
  return output
}
