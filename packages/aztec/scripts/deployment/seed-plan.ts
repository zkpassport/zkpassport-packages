/**
 * The pure parts of seed-registry.ts: which vks a run seeds, whether the release's manifest and
 * circuit root agree, and what each selected vk and the release's version need.
 */

/** The parts of a ZKPassport circuit manifest the seed script reads. */
export type CircuitManifest = {
  version?: string
  root?: string
  circuits: Record<string, { hash: string }>
}

/**
 * The standard outer circuits, one per subproof count (outer_count_4 .. outer_count_13). The
 * EVM (`outer_evm_*`) and Aadhaar (`outer_aadhaar_*`) families are never seeded by default.
 */
export const STANDARD_OUTER_CIRCUIT = /^outer_count_\d+$/

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
          `"${name}" not in the ZKPassport circuit manifest (v${manifest.version ?? "?"}) — available: ${Object.keys(manifest.circuits).join(", ")}`,
        )
      }
      return { name, hash: entry.hash, explicit: true }
    })
  }

  const standard = Object.keys(manifest.circuits)
    .filter((name) => STANDARD_OUTER_CIRCUIT.test(name))
    .sort((a, b) => subproofCount(a) - subproofCount(b))
  if (standard.length === 0) {
    throw new Error(
      `no outer_count_N circuit in the circuit manifest (v${manifest.version ?? "?"})`,
    )
  }
  return standard.map((name) => ({ name, hash: manifest.circuits[name].hash, explicit: false }))
}

function subproofCount(name: string): number {
  return Number(name.slice(name.lastIndexOf("_") + 1))
}

/** A circuit root as the L1 RootRegistry reports it. */
export type CircuitRootDetails = { root: string; revoked: boolean }

/** A manifest that passed {@link assertManifestMatchesRoot}. */
export type ReleaseManifest = CircuitManifest & { version: string; root: string }

/**
 * Throw unless `manifest` is the requested release and its vk set is the one `circuitRoot`
 * commits to, so the vks seeded under the manifest's version match the circuit root seeded
 * alongside them.
 *
 * @param requestedVersion - CIRCUIT_MANIFEST_VERSION, or undefined for the latest release
 */
export function assertManifestMatchesRoot(
  manifest: CircuitManifest,
  circuitRoot: CircuitRootDetails,
  requestedVersion?: string,
): asserts manifest is ReleaseManifest {
  if (!manifest.version) throw new Error("the circuit manifest has no version")
  if (requestedVersion !== undefined && manifest.version !== requestedVersion) {
    throw new Error(
      `fetched circuit manifest is v${manifest.version}, not the requested v${requestedVersion}`,
    )
  }
  if (!manifest.root) throw new Error(`circuit manifest v${manifest.version} has no root`)
  if (BigInt(manifest.root) !== BigInt(circuitRoot.root)) {
    throw new Error(
      `circuit manifest v${manifest.version} commits to root ${manifest.root}, but the RootRegistry ` +
        `returned circuit root ${circuitRoot.root}`,
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
 * Decide whether to schedule `root` as the registry's latest root.
 *
 * A root that is not the RootRegistry's latest, and that the registry neither holds nor has
 * scheduled, is held back as a rollback unless `allowRollback`. Scheduling it would close the
 * validity interval of the registry's newer root, and the contract's duplicate-root guard would
 * then refuse to make that newer root the latest again.
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
  if (!opts.isRootRegistryLatest && !opts.allowRollback) return { status: "rollback" }
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
 * Decide what a selected vk needs. A scheduled change is never overridden. A vk that is not
 * accepted is added when its slot was never written; once written it reads `false` only after a
 * removal, so it is restored only when named explicitly and is otherwise left revoked.
 */
export function decideVk(state: BoolDpmState, explicit: boolean, nowSecs: bigint): VkDecision {
  if (state.maturesAt > nowSecs) {
    return { status: "scheduled", to: state.scheduled, maturesAt: state.maturesAt }
  }
  if (state.current) return { status: "accepted" }
  if (state.maturesAt === 0n) return { status: "add" }
  return explicit ? { status: "restore" } : { status: "revoked" }
}

export type VersionDecision =
  { status: "enable" } | { status: "enabled" } | PendingChange | { status: "disabled" }

/**
 * Decide what the release's version needs. It is enabled only when it was never written: a
 * version that reads `false` after a write was disabled, and this script never re-enables one.
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

/**
 * Whether this run may send transactions: only when SEND_TXS is exactly "1", and never while
 * DRY_RUN is set. Every other run only prints the plan.
 */
export function sendRequested(env: { SEND_TXS?: string; DRY_RUN?: string }): boolean {
  return !env.DRY_RUN && env.SEND_TXS === "1"
}
