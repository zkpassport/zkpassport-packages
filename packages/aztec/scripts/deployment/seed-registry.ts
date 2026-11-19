/**
 * Seed a deployed ZKPassportRegistry with the live ZKPassport roots and a circuit release's vks.
 *
 * The registry deploys empty (see deploy-testnet.ts / deploy-mainnet.ts); private
 * verifiers can pass `assert_proof_valid` only after this script has pushed:
 *   - update_root(REGISTRY_CERTIFICATE, <latest cert root>)
 *   - update_root(REGISTRY_CIRCUIT, <the release's circuit root>)
 *   - add_accepted_vk(<version>, <outer circuit vk hash>) (one per selected vk: by default every
 *                                                          outer_count_N of the release)
 *   - set_version_status(<version>, true)               (enables the circuit release)
 *   - set_oprf_pk_hash(<OPRF public key hash>)          (checked against salted proofs)
 *
 * Values come from ZKPassport's own Ethereum RootRegistry via @zkpassport/registry's
 * RegistryClient — the exact chain the prover uses: mock/dev-mode passports prove
 * against the SEPOLIA registry, real passports against ETHEREUM MAINNET. So:
 *   testnet seed  -> Sepolia roots  (dev-mode phone flows verify)
 *   mainnet seed  -> mainnet roots  (real-passport flows verify)
 *
 * The release is the RootRegistry's latest circuit root and its manifest, or the manifest of
 * CIRCUIT_MANIFEST_VERSION from the circuits CDN's by-version path. Before touching the Aztec
 * registry the script checks that the manifest commits to a circuit root the RootRegistry holds
 * and has not revoked, so the vks it accepts are exactly the set that root commits to.
 *
 * Rollbacks: an older release's circuit root is not scheduled as the registry's latest unless
 * the registry already holds or has scheduled it. Doing so would close the validity interval of
 * the registry's newer root, and the contract's duplicate-root guard would then stop that root
 * from becoming the latest again. The older release's vks are still seeded. Set
 * ALLOW_CIRCUIT_ROOT_ROLLBACK=1 to schedule the older root deliberately.
 *
 * Every seeded value is a DelayedPublicMutable write: it becomes readable by private
 * verifiers only INITIAL_DELAY after the tx (24h production, or the PREVIEW_DELAY the
 * class was compiled with). There is no time-warp on a real network. Note that in
 * MODE_VALID_WITHIN_WINDOW the *latest* root is always valid once readable, so the
 * `timestamp` we seed (now) never blocks the happy path.
 *
 * Idempotency: values already live in the registry are skipped via the utility views.
 * Values pushed within the last INITIAL_DELAY are invisible to those views, so the
 * script additionally reads each DelayedPublicMutable's scheduled change from raw
 * public storage and reports pending values with their maturity time ("live at ...
 * (~Nmin)") instead of re-sending them. Re-running until it prints "registry is fully
 * seeded — nothing to do" therefore doubles as the readiness probe, and mid-delay
 * re-runs send nothing.
 *
 * Removals: is_vk_accepted and is_version_enabled read `false` both for a value that was never
 * written and for one that was removed. Raw storage tells them apart, since every write records
 * its change's timestamp. A removed vk is restored only when named in VK_CIRCUITS or VK_HASH, and
 * the diff marks it as previously revoked; a disabled version is never re-enabled.
 *
 * Dry run by default: the script prints the plan, with a per-vk diff of what would be added,
 * what is already accepted and what is already scheduled, and sends nothing without SEND_TXS=1.
 *
 * Usage: npm run seed:testnet | npm run seed:mainnet   (or: npx tsx deployment/seed-registry.ts <network>)
 *        SEND_TXS=1 npm run seed:testnet               (send the planned transactions)
 *
 * Env:
 *   REGISTRY_OPERATOR_SECRET     REQUIRED: secret of the account holding the operator
 *                                role, which sends every seeding transaction.
 *   ZKPASSPORT_REGISTRY_ADDRESS  registry to seed. Default: read from the deploy manifest
 *                                (deployments/<network>.json, else <network>-preview.json).
 *   AZTEC_NODE_URL               node RPC (default per network, same as the deploy scripts)
 *   SALT                         account salt for the operator account (default 0, must
 *                                match the salt its address was derived with)
 *   ZKP_REGISTRY_RPC_URL         Ethereum RPC for ZKPassport's RootRegistry
 *                                (default: public Sepolia RPC on testnet, mainnet RPC on mainnet)
 *   ZKP_REGISTRY_CHAIN_ID        chain of that RootRegistry (default matches the RPC above).
 *                                Override BOTH to seed cross-chain roots — e.g. REAL passports
 *                                verified on the Aztec testnet need the MAINNET roots:
 *                                ZKP_REGISTRY_CHAIN_ID=1 ZKP_REGISTRY_RPC_URL=<mainnet rpc>
 *   CIRCUIT_MANIFEST_VERSION     circuit release to seed, e.g. 0.23.0: its manifest and circuit
 *                                root (default: the RootRegistry's latest circuit root and its
 *                                manifest). The vks are accepted and enabled under the release's
 *                                semver, packed as 2-byte BE major/minor/patch, left-aligned
 *                                bytes32 (the SDK's L1 params.version encoding).
 *   ALLOW_CIRCUIT_ROOT_ROLLBACK  "1" to schedule an older release's circuit root as the latest
 *                                even though the registry may hold a newer one (see Rollbacks)
 *   VK_CIRCUITS                  comma-separated circuits of the release's manifest to accept,
 *                                named explicitly (default: every outer_count_N in it)
 *   VK_HASH                      accept this exact vk hash instead, named explicitly
 *   OPRF_PK_HASH                 OPRF public key hash to seed (default: DEFAULT_OPRF_PUB_KEY_HASH
 *                                from @zkpassport/utils, the hash of the default OPRF key)
 *   SEND_TXS                     exactly "1" to send the planned transactions; any other run is
 *                                a dry run
 *   DRY_RUN                      force a dry run even with SEND_TXS=1
 *
 * Fees: testnet uses the live SponsoredFPC (same artifact derivation + on-chain
 * verification as deploy-testnet.ts). Mainnet pays with the operator's own Fee Juice —
 * seeding costs a few small public txs (see deploy-mainnet.ts for bridging).
 */
import { AztecAddress } from "@aztec-labs/aztec.js/addresses"
import { SponsoredFeePaymentMethod } from "@aztec-labs/aztec.js/fee"
import { Fr } from "@aztec-labs/aztec.js/fields"
import { deriveStorageSlotInMap } from "@aztec-labs/stdlib/hash"
import { DEFAULT_OPRF_PUB_KEY_HASH } from "@zkpassport/utils/oprf"
import { packCircuitManifestVersion } from "./circuit-version.js"
import {
  type BoolDpmState,
  type CircuitManifest,
  type CircuitRootDetails,
  type ReleaseManifest,
  type RootState,
  type SelectedVk,
  type VkDecision,
  assertManifestMatchesRoot,
  decideRoot,
  decideVersion,
  decideVk,
  formatVkDiff,
  liveAt,
  selectVks,
  sendRequested,
} from "./seed-plan.js"
import { existsSync, readFileSync } from "fs"
import { createRequire } from "node:module"
import { ZKPassportRegistryContract } from "../artifacts/ZKPassportRegistry.js"
import {
  type Network,
  type NodeClient,
  WAIT,
  connectAndCheckNode,
  defaultNodeUrl,
  createEphemeralWallet,
  deploymentRecordPath,
  deriveSchnorrAccount,
  requiredSecret,
  saltFromEnv,
  verifySponsoredFPC,
  writeDeploymentRecord,
} from "./common.js"

// zkpassport_registry_contract::types registry ids
const REGISTRY_CERTIFICATE = 1n
const REGISTRY_CIRCUIT = 2n

const NETWORKS = {
  testnet: {
    nodeUrl: defaultNodeUrl("testnet"),
    // Mock/dev-mode passports prove against the SEPOLIA RootRegistry.
    registryChainId: 11155111,
    registryRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    sponsored: true,
  },
  mainnet: {
    nodeUrl: defaultNodeUrl("mainnet"),
    // Real passports prove against the ETHEREUM MAINNET RootRegistry.
    registryChainId: 1,
    registryRpcUrl: "https://ethereum-rpc.publicnode.com",
    sponsored: false,
  },
} as const satisfies Record<Network, object>

// @zkpassport/registry is CJS-friendly
const require = createRequire(import.meta.url)
type RegistryClientT = {
  getCircuitManifest(root?: string, opts?: { version?: string }): Promise<CircuitManifest>
  getCircuitRootDetails(root: string): Promise<CircuitRootDetails>
  getLatestCertificateRoot(): Promise<string>
  getLatestCircuitRoot(): Promise<string>
  getUrlForCircuitManifestByRoot(root: string): string
  getUrlForCircuitManifestByVersion(version: string): string
}
function registryClient(chainId: number, rpcUrl: string): RegistryClientT {
  const { RegistryClient } = require("@zkpassport/registry") as {
    RegistryClient: new (o: { chainId: number; rpcUrl: string }) => RegistryClientT
  }
  return new RegistryClient({ chainId, rpcUrl })
}

/**
 * Fetch a circuit release and its circuit root from the RootRegistry, and check they agree.
 *
 * With `version`, the manifest comes from the circuits CDN's by-version path; otherwise it is
 * the manifest of the RootRegistry's latest circuit root. Either way the client checks that the
 * manifest's vk hashes hash to its root.
 */
async function fetchRelease(
  client: RegistryClientT,
  version: string | undefined,
): Promise<{
  manifest: ReleaseManifest
  circuitRoot: CircuitRootDetails
  isRootRegistryLatest: boolean
}> {
  const latestRoot = await client.getLatestCircuitRoot()
  let manifest: CircuitManifest
  let root: string | undefined
  if (version) {
    console.log(
      `circuit manifest v${version}: ${client.getUrlForCircuitManifestByVersion(version)}`,
    )
    manifest = await client.getCircuitManifest(undefined, { version })
    root = manifest.root
  } else {
    root = latestRoot
    console.log(`circuit manifest (latest): ${client.getUrlForCircuitManifestByRoot(root)}`)
    manifest = await client.getCircuitManifest(root)
  }
  if (!root) throw new Error(`circuit manifest v${manifest.version ?? "?"} has no root`)
  let circuitRoot: CircuitRootDetails
  try {
    circuitRoot = await client.getCircuitRootDetails(root)
  } catch (e) {
    throw new Error(`circuit root ${root} not found in the RootRegistry: ${(e as Error).message}`)
  }
  assertManifestMatchesRoot(manifest, circuitRoot, version)
  return { manifest, circuitRoot, isRootRegistryLatest: BigInt(root) === BigInt(latestRoot) }
}

/** Unwrap a utility-view simulate() (SimulationResult carries the value in .result). */
function unwrap<T>(res: unknown): T {
  return ((res as { result?: unknown }).result ?? res) as T
}

/**
 * Read a DelayedPublicMutable's scheduled change straight from public storage.
 *
 * The contract's utility views expose only delay-applied values, so a change scheduled
 * within the last INITIAL_DELAY is invisible to them — but the schedule itself is
 * public state. Layout (the protocol's DelayedPublicMutableValues, packed to 2M+1
 * slots, M = the value's packed length): the first slot packs both change timestamps
 * (the value change's in its low 32 bits), then `pre` (M slots), then `post`
 * (M slots). `post` is the pending value until `maturesAt`, the current value after.
 */
async function readScheduledChange(
  node: NodeClient,
  contract: AztecAddress,
  varSlot: Fr,
  mapKeys: Fr[],
  valueSize: number,
): Promise<{ post: Fr[]; maturesAt: bigint }> {
  let slot = varSlot
  for (const key of mapKeys) slot = await deriveStorageSlotInMap(slot, { toField: () => key })
  const fields = await Promise.all(
    Array.from({ length: 2 * valueSize + 1 }, (_, i) =>
      node.getPublicStorageAt("latest", contract, slot.add(new Fr(i))),
    ),
  )
  return { post: fields.slice(1 + valueSize), maturesAt: fields[0].toBigInt() & 0xffffffffn }
}

function resolveRegistryAddress(network: Network): { address: AztecAddress; source: string } {
  const env = process.env.ZKPASSPORT_REGISTRY_ADDRESS
  if (env) return { address: AztecAddress.fromStringUnsafe(env), source: "env" }
  for (const name of [`${network}.json`, `${network}-preview.json`]) {
    const path = deploymentRecordPath(name)
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, "utf8")) as { registry?: string }
      if (manifest.registry) {
        return { address: AztecAddress.fromStringUnsafe(manifest.registry), source: name }
      }
    }
  }
  throw new Error(
    "no registry address: set ZKPASSPORT_REGISTRY_ADDRESS or run the deploy script first (deployments/<network>[-preview].json)",
  )
}

async function main() {
  const network = (process.argv[2] ?? process.env.NETWORK ?? "testnet") as Network
  const cfg = NETWORKS[network]
  if (!cfg) throw new Error(`usage: seed-registry.ts <testnet|mainnet> (got "${network}")`)

  const operatorSecret = requiredSecret("REGISTRY_OPERATOR_SECRET")
  const salt = saltFromEnv()
  const nodeUrl = process.env.AZTEC_NODE_URL ?? cfg.nodeUrl
  const { address: registryAddress, source } = resolveRegistryAddress(network)

  // ── Resolve the values to seed from ZKPassport's Ethereum RootRegistry ──────
  const zkpRpc = process.env.ZKP_REGISTRY_RPC_URL ?? cfg.registryRpcUrl
  const zkpChainId = process.env.ZKP_REGISTRY_CHAIN_ID
    ? Number(process.env.ZKP_REGISTRY_CHAIN_ID)
    : cfg.registryChainId
  const client = registryClient(zkpChainId, zkpRpc)
  const [certRoot, release] = await Promise.all([
    client.getLatestCertificateRoot(),
    fetchRelease(client, process.env.CIRCUIT_MANIFEST_VERSION || undefined),
  ])
  const { manifest } = release
  const circuitRoot = release.circuitRoot.root
  const vkHashes = selectVks(manifest, process.env)
  const manifestSemver = manifest.version
  const vkVersionFr = packCircuitManifestVersion(manifestSemver)
  console.log(`ZKPassport RootRegistry (chain ${zkpChainId}, manifest v${manifestSemver}):`)
  console.log(`  certificate root: ${certRoot}`)
  console.log(
    `  circuit root:     ${circuitRoot}${release.isRootRegistryLatest ? "" : " (not the RootRegistry's latest)"}`,
  )
  console.log(`  circuit manifest version: ${manifestSemver} -> ${vkVersionFr}`)
  console.log(
    `  vks selected: ${vkHashes.length} (${vkHashes.some((vk) => vk.explicit) ? "named explicitly" : "every outer_count_N"})`,
  )

  // ── Connect + rebuild the operator account ───────────────────────────────────
  const { node } = await connectAndCheckNode(nodeUrl, network)

  const wallet = await createEphemeralWallet(nodeUrl, true)
  const operatorSender = await deriveSchnorrAccount(wallet, operatorSecret, salt)
  console.log(`operator sender: ${operatorSender.address}`)

  const instance = await node.getContract(registryAddress)
  if (!instance) throw new Error(`no contract on-chain at ${registryAddress} (${source})`)
  await wallet.registerContract(instance, ZKPassportRegistryContract.artifact)
  const registry = await ZKPassportRegistryContract.at(registryAddress, wallet)
  console.log(`registry: ${registryAddress} (from ${source})`)

  // Fees: sponsored on testnet (same artifact derivation + on-chain check as the deploy
  // scripts), the operator's Fee Juice on mainnet.
  let fee: { paymentMethod: SponsoredFeePaymentMethod } | undefined
  if (cfg.sponsored) {
    const fpc = await verifySponsoredFPC(node, wallet)
    fee = { paymentMethod: new SponsoredFeePaymentMethod(fpc.address) }
  }
  const sendOptsFor = (senderAddress: AztecAddress) => ({
    from: senderAddress,
    ...(fee ? { fee } : {}),
    wait: WAIT,
  })

  // ── Plan: compare against the registry's (delay-applied) current state ───────
  const nowSecs = BigInt(Math.floor(Date.now() / 1000))
  const allowRollback = process.env.ALLOW_CIRCUIT_ROOT_ROLLBACK === "1"
  const roots = [
    {
      id: REGISTRY_CERTIFICATE,
      label: "certificate",
      root: certRoot,
      opts: { isRootRegistryLatest: true, allowRollback: false },
    },
    {
      id: REGISTRY_CIRCUIT,
      label: "circuit",
      root: circuitRoot,
      opts: { isRootRegistryLatest: release.isRootRegistryLatest, allowRollback },
    },
  ]

  // Storage slots for the raw scheduled-change reads (see readScheduledChange).
  const layout = ZKPassportRegistryContract.storage
  const rootState = async (id: bigint): Promise<RootState> => {
    const pair = unwrap<{ latest: bigint }>(
      await registry.methods.get_latest_pair(id).simulate({ from: operatorSender.address }),
    )
    // LatestRootPair packs to 2 fields (latest, previous); post[0] is the scheduled latest.
    const sched = await readScheduledChange(
      node,
      registryAddress,
      layout.latest.slot,
      [new Fr(id)],
      2,
    )
    return {
      current: BigInt(pair.latest),
      scheduled: sched.post[0].toBigInt(),
      maturesAt: sched.maturesAt,
    }
  }

  const actions: string[] = []
  let pendingMaturity = 0
  let heldBack = 0
  for (const r of roots) {
    const state = await rootState(r.id)
    const decision = decideRoot(BigInt(r.root), state, r.opts, nowSecs)
    if (decision.status === "live") {
      console.log(`${r.label} root is already live in the registry — skipping`)
    } else if (decision.status === "scheduled") {
      console.log(
        `${r.label} root ${r.root} is already pushed — ${liveAt(decision.maturesAt, nowSecs)} — skipping`,
      )
      pendingMaturity++
    } else if (decision.status === "rollback") {
      console.log(
        `${r.label} root ${r.root} (v${manifestSemver}) is neither the RootRegistry's latest nor ` +
          `held by the registry (latest ${new Fr(state.current)}): scheduling it could roll back ` +
          `a newer root for good — skipping; set ALLOW_CIRCUIT_ROOT_ROLLBACK=1 to do it deliberately`,
      )
      heldBack++
    } else {
      actions.push(`update_root(${r.label}): ${new Fr(state.current)} -> ${r.root}`)
    }
  }

  const boolState = async (
    view: { simulate(o: { from: AztecAddress }): Promise<unknown> },
    varSlot: Fr,
    mapKeys: Fr[],
  ): Promise<BoolDpmState> => {
    const current = Boolean(unwrap(await view.simulate({ from: operatorSender.address })))
    const sched = await readScheduledChange(node, registryAddress, varSlot, mapKeys, 1)
    return { current, scheduled: !sched.post[0].isZero(), maturesAt: sched.maturesAt }
  }
  const vkState = (vk: SelectedVk) => {
    const hashFr = Fr.fromHexString(vk.hash)
    return boolState(
      registry.methods.is_vk_accepted(vkVersionFr, hashFr),
      layout.accepted_vks.slot,
      [vkVersionFr, hashFr],
    )
  }
  const versionState = () =>
    boolState(registry.methods.is_version_enabled(vkVersionFr), layout.version_enabled.slot, [
      vkVersionFr,
    ])

  const vkPlans: (SelectedVk & { decision: VkDecision })[] = []
  for (const vk of vkHashes) {
    vkPlans.push({ ...vk, decision: decideVk(await vkState(vk), vk.explicit, nowSecs) })
  }
  console.log(`vks under v${manifestSemver}:\n  ${formatVkDiff(vkPlans, nowSecs).join("\n  ")}`)
  for (const vk of vkPlans) {
    if (vk.decision.status === "add") {
      actions.push(`add_accepted_vk(v${manifestSemver}, ${vk.name}): ${vk.hash}`)
    } else if (vk.decision.status === "restore") {
      actions.push(
        `add_accepted_vk(v${manifestSemver}, ${vk.name}): ${vk.hash} (previously revoked; re-adding)`,
      )
    } else if (vk.decision.status === "scheduled") {
      pendingMaturity++
    } else if (vk.decision.status === "revoked") {
      heldBack++
    }
  }

  const version = decideVersion(await versionState(), nowSecs)
  if (version.status === "enable") {
    actions.push(`set_version_status(v${manifestSemver}, true)`)
  } else if (version.status === "enabled") {
    console.log(`vk version ${manifestSemver} is already enabled — skipping`)
  } else if (version.status === "scheduled") {
    console.log(
      `vk version ${manifestSemver} is already scheduled to be ${version.to ? "enabled" : "disabled"} — ${liveAt(version.maturesAt, nowSecs)} — skipping`,
    )
    pendingMaturity++
  } else {
    console.log(
      `vk version ${manifestSemver} was disabled — this script never re-enables a release — skipping`,
    )
    heldBack++
  }
  const oprf = process.env.OPRF_PK_HASH
    ? Fr.fromHexString(process.env.OPRF_PK_HASH)
    : new Fr(DEFAULT_OPRF_PUB_KEY_HASH)
  let oprfNeeded = false
  const oprfSched = await readScheduledChange(
    node,
    registryAddress,
    layout.oprf_pk_hash.slot,
    [],
    1,
  )
  if (oprfSched.post[0].equals(oprf)) {
    if (oprfSched.maturesAt > nowSecs) {
      console.log(
        `oprf_pk_hash is already scheduled — ${liveAt(oprfSched.maturesAt, nowSecs)} — skipping`,
      )
      pendingMaturity++
    } else {
      console.log("oprf_pk_hash is already live — skipping")
    }
  } else {
    oprfNeeded = true
    actions.push(`set_oprf_pk_hash: ${oprf}`)
  }

  if (actions.length === 0) {
    if (pendingMaturity > 0) {
      console.log(
        `nothing to send — ${pendingMaturity} value(s) already pushed and still inside the DPM delay (maturity times above); re-run later to confirm`,
      )
    }
    if (heldBack > 0) {
      console.log(
        `nothing to send — ${heldBack} value(s) held back: revoked, disabled, or a circuit-root rollback (see above)`,
      )
    }
    if (pendingMaturity === 0 && heldBack === 0) {
      console.log("registry is fully seeded — nothing to do")
    }
    return
  }
  console.log(`planned actions:\n  ${actions.join("\n  ")}`)
  if (!sendRequested(process.env)) {
    console.log(
      process.env.DRY_RUN
        ? "DRY_RUN set — stopping before any tx"
        : "dry run — set SEND_TXS=1 to send these transactions",
    )
    return
  }

  // ── Execute (sequential txs; each is minutes of client-side proving) ─────────
  const seeded: Record<string, string> = {}
  for (const r of roots) {
    const state = await rootState(r.id)
    // Reported in the plan unless it changed since; only "update" sends.
    if (decideRoot(BigInt(r.root), state, r.opts, nowSecs).status !== "update") continue
    const call = registry.methods.update_root(
      r.id,
      Fr.fromHexString(r.root),
      new Fr(state.current),
      nowSecs,
    )
    try {
      await call.simulate({ from: operatorSender.address })
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      if (msg.includes("root already exists")) {
        console.log(
          `${r.label} root ${r.root} was already pushed (still inside the DPM delay) — ${liveAt(state.maturesAt, nowSecs)} — skipping`,
        )
        continue
      }
      if (msg.includes("current root mismatch")) {
        console.log(
          `${r.label}: a different root (${new Fr(state.scheduled)}) is scheduled — ${liveAt(state.maturesAt, nowSecs)} — re-run after the delay. Skipping.`,
        )
        continue
      }
      throw e
    }
    console.log(`update_root(${r.label}, ${r.root}) — proving + sending...`)
    await call.send(sendOptsFor(operatorSender.address))
    console.log(`  done`)
    seeded[`${r.label}Root`] = r.root
  }

  for (const vk of vkHashes) {
    // Re-read right before sending: each earlier tx took minutes, and the plan may be stale.
    const { status } = decideVk(await vkState(vk), vk.explicit, nowSecs)
    if (status !== "add" && status !== "restore") continue
    console.log(
      `add_accepted_vk(v${manifestSemver}, ${vk.name}, ${vk.hash}) — proving + sending...`,
    )
    await registry.methods
      .add_accepted_vk(vkVersionFr, Fr.fromHexString(vk.hash))
      .send(sendOptsFor(operatorSender.address))
    console.log(`  done`)
    seeded[`vk:${vk.name}`] = vk.hash
  }

  if (decideVersion(await versionState(), nowSecs).status === "enable") {
    console.log(`set_version_status(v${manifestSemver}, true) — proving + sending...`)
    await registry.methods
      .set_version_status(vkVersionFr, true)
      .send(sendOptsFor(operatorSender.address))
    console.log(`  done`)
    seeded[`version:${manifestSemver}`] = "enabled"
  }

  if (oprfNeeded) {
    console.log(`set_oprf_pk_hash(${oprf}) — proving + sending...`)
    await registry.methods.set_oprf_pk_hash(oprf).send(sendOptsFor(operatorSender.address))
    console.log(`  done`)
    seeded.oprfPkHash = oprf.toString()
  }

  const record = {
    network,
    nodeUrl,
    registry: registryAddress.toString(),
    senders: {
      operator: operatorSender.address.toString(),
    },
    zkpassportRegistryChainId: zkpChainId,
    circuitManifestVersion: manifestSemver,
    certRoot,
    circuitRoot,
    vkHashes,
    seededThisRun: seeded,
    seededAt: new Date().toISOString(),
  }
  writeDeploymentRecord(`${network}-seed.json`, record)

  console.log("---")
  console.log(
    "NOTE: every value seeded this run is behind the registry's DelayedPublicMutable delay " +
      "(INITIAL_DELAY of the deployed class: 24h production, or the PREVIEW_DELAY it was " +
      "compiled with). Private verifiers can read them only after that delay elapses.",
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
