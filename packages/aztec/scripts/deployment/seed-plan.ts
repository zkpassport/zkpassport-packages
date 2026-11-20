/** Planning logic for seed-registry.ts that does not touch the network. */

/** The parts of a ZKPassport circuit manifest the seed script reads. */
export type CircuitManifest = {
  version: string
  root: string
  circuits: Record<string, { hash: string }>
}

/** The EVM (`outer_evm_*`) and Aadhaar (`outer_aadhaar_*`) families are never seeded by default. */
const STANDARD_OUTER_CIRCUIT = /^outer_count_\d+$/

/** A vk to seed. `explicit` is true when the operator named it in VK_CIRCUITS or VK_HASH. */
export type SelectedVk = { name: string; hash: string; explicit: boolean }

/**
 * Pick the vks to seed from `manifest`: the VK_HASH env var's hash, else the circuits named in
 * VK_CIRCUITS, else every standard outer circuit in the manifest in subproof-count order.
 */
export function selectVks(
  manifest: CircuitManifest,
  env: { VK_CIRCUITS?: string; VK_HASH?: string },
): SelectedVk[] {
  if (env.VK_HASH) return [{ name: "(VK_HASH env)", hash: env.VK_HASH, explicit: true }]

  const named = (env.VK_CIRCUITS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (named.length > 0) {
    return named.map((name) => {
      const entry = manifest.circuits[name]
      if (!entry?.hash) {
        throw new Error(
          `"${name}" not in the ZKPassport circuit manifest (v${manifest.version}) — available: ${Object.keys(manifest.circuits).join(", ")}`,
        )
      }
      return { name, hash: entry.hash, explicit: true }
    })
  }

  const standard = Object.keys(manifest.circuits)
    .filter((name) => STANDARD_OUTER_CIRCUIT.test(name))
    .sort((a, b) => subproofCount(a) - subproofCount(b))
  if (standard.length === 0) {
    throw new Error(`no outer_count_N circuit in the circuit manifest (v${manifest.version})`)
  }
  return standard.map((name) => ({ name, hash: manifest.circuits[name].hash, explicit: false }))
}

function subproofCount(name: string): number {
  return Number(name.slice(name.lastIndexOf("_") + 1))
}

/** A circuit root as the L1 RootRegistry reports it. */
export type CircuitRootDetails = { root: string; revoked: boolean }

/**
 * Throw unless `manifest` is the requested release and the RootRegistry has not revoked its root.
 *
 * @param requestedVersion - CIRCUIT_MANIFEST_VERSION, or undefined for the latest release
 */
export function assertSeedableRelease(
  manifest: CircuitManifest,
  circuitRoot: CircuitRootDetails,
  requestedVersion?: string,
): void {
  if (requestedVersion !== undefined && manifest.version !== requestedVersion) {
    throw new Error(
      `fetched circuit manifest is v${manifest.version}, not the requested v${requestedVersion}`,
    )
  }
  if (circuitRoot.revoked) {
    throw new Error(
      `circuit root ${circuitRoot.root} (v${manifest.version}) is revoked in the RootRegistry`,
    )
  }
}

/** A registry's latest-root slot: its delay-applied latest root and its last scheduled one. */
export type RootState = { current: bigint; scheduled: bigint; maturesAt: bigint }

export type RootDecision =
  | { status: "live" }
  | { status: "scheduled"; maturesAt: bigint }
  | { status: "update" }
  | { status: "rollback" }

/**
 * Decide whether to schedule `root` as the registry's latest root. A root that is not the
 * RootRegistry's latest is held back as a rollback, unless `allowRollback` or the registry holds
 * no circuit root yet (see Rollbacks in seed-registry.ts).
 */
export function decideRoot(
  root: bigint,
  state: RootState,
  opts: { isRootRegistryLatest: boolean; allowRollback: boolean },
  nowSecs: bigint,
): RootDecision {
  if (root === state.current) return { status: "live" }
  if (root === state.scheduled && state.maturesAt > nowSecs) {
    return { status: "scheduled", maturesAt: state.maturesAt }
  }
  const registryEmpty = state.current === 0n && state.scheduled === 0n
  if (!opts.isRootRegistryLatest && !opts.allowRollback && !registryEmpty) {
    return { status: "rollback" }
  }
  return { status: "update" }
}

/** A registry `DelayedPublicMutable<bool>`, read through its utility view and raw storage. */
export type BoolDpmState = {
  /** The delay-applied value private verifiers read now. */
  current: boolean
  /** The value of the most recent scheduled change. */
  scheduled: boolean
  /** When that change takes effect, in unix seconds. 0 if the value was never written. */
  maturesAt: bigint
}

/** A change already scheduled and not yet readable by private verifiers. */
export type PendingChange = { status: "scheduled"; to: boolean; maturesAt: bigint }

export type VkDecision =
  | { status: "add" }
  | { status: "restore" }
  | { status: "accepted" }
  | PendingChange
  | { status: "revoked" }

/**
 * Decide what a selected vk needs. A written slot reads `false` only after a removal, so a
 * removed vk is re-added only when the operator named it.
 */
export function decideVk(vk: SelectedVk, state: BoolDpmState, nowSecs: bigint): VkDecision {
  if (state.maturesAt > nowSecs) {
    return { status: "scheduled", to: state.scheduled, maturesAt: state.maturesAt }
  }
  if (state.current) return { status: "accepted" }
  if (state.maturesAt === 0n) return { status: "add" }
  return vk.explicit ? { status: "restore" } : { status: "revoked" }
}

export type VersionDecision =
  { status: "enable" } | { status: "enabled" } | PendingChange | { status: "disabled" }

/**
 * Decide what the release's version needs. A written slot reads `false` only after the version
 * was disabled, and this script never re-enables one.
 */
export function decideVersion(state: BoolDpmState, nowSecs: bigint): VersionDecision {
  if (state.maturesAt > nowSecs) {
    return { status: "scheduled", to: state.scheduled, maturesAt: state.maturesAt }
  }
  if (state.current) return { status: "enabled" }
  if (state.maturesAt === 0n) return { status: "enable" }
  return { status: "disabled" }
}

/** "live at 2026-08-20T14:31:00Z (~87min)": when a scheduled DPM change becomes readable. */
export function liveAt(maturesAt: bigint, nowSecs: bigint): string {
  const at = new Date(Number(maturesAt) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
  if (maturesAt <= nowSecs) return `readable since ${at}`
  return `live at ${at} (~${Math.ceil(Number(maturesAt - nowSecs) / 60)}min)`
}

/** The seeding diff for the selected vks, one line per vk in selection order. */
export function formatVkDiff(
  vks: (SelectedVk & { decision: VkDecision })[],
  nowSecs: bigint,
): string[] {
  const width = Math.max(...vks.map((vk) => vk.name.length))
  return vks.map(({ name, hash, decision }) => {
    const label = `${name.padEnd(width)} ${hash}`
    switch (decision.status) {
      case "add":
        return `+ ${label}  would be added`
      case "accepted":
        return `= ${label}  already accepted`
      case "scheduled":
        return `~ ${label}  already scheduled: ${decision.to ? "accept" : "remove"}, ${liveAt(decision.maturesAt, nowSecs)}`
      case "revoked":
        return `! ${label}  previously revoked: not re-added unless named in VK_CIRCUITS or VK_HASH`
      case "restore":
        return `R ${label}  previously revoked; will re-add (named explicitly)`
    }
  })
}

/** Whether this run may send transactions (see SEND_TXS and DRY_RUN in seed-registry.ts). */
export function sendRequested(env: { SEND_TXS?: string; DRY_RUN?: string }): boolean {
  return !env.DRY_RUN && env.SEND_TXS === "1"
}
