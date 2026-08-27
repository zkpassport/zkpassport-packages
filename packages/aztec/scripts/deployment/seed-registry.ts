/**
 * Seed a deployed ZKPassportRegistry with the live ZKPassport roots + circuit vk.
 *
 * The registry deploys empty (see deploy-testnet.ts / deploy-mainnet.ts); private
 * verifiers can pass `assert_proof_valid` only after this script has pushed:
 *   - update_root(REGISTRY_CERTIFICATE, <latest cert root>)
 *   - update_root(REGISTRY_CIRCUIT, <latest circuit root>)
 *   - add_accepted_vk(<version>, <outer circuit vk hash>) (one per circuit in VK_CIRCUITS)
 *   - set_version_status(<version>, true)               (enables the circuit release)
 *   - set_oprf_pk_hash(...)                             (only if OPRF_PK_HASH is set —
 *                                                        needed for salted/vOPRF nullifiers only)
 *
 * Values come from ZKPassport's own Ethereum RootRegistry via @zkpassport/registry's
 * RegistryClient — the exact chain the prover uses: mock/dev-mode passports prove
 * against the SEPOLIA registry, real passports against ETHEREUM MAINNET. So:
 *   testnet seed  -> Sepolia roots  (dev-mode phone flows verify)
 *   mainnet seed  -> mainnet roots  (real-passport flows verify)
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
 * Usage: npm run seed:testnet | npm run seed:mainnet   (or: npx tsx deployment/seed-registry.ts <network>)
 *
 * Env:
 *   ZKPASSPORT_DEPLOYER_SECRET   REQUIRED — the deploy script's secret. The sender must
 *                                hold the registry's oracle role (update_root) and admin
 *                                role (add_accepted_vk / set_version_status /
 *                                set_oprf_pk_hash); both default
 *                                to the deployer at deploy time.
 *   ZKPASSPORT_REGISTRY_ADDRESS  registry to seed. Default: read from the deploy manifest
 *                                (deployments/<network>.json, else <network>-preview.json).
 *   AZTEC_NODE_URL               node RPC (default per network, same as the deploy scripts)
 *   SALT                         deployer account salt (default 0, must match the deploy)
 *   ZKP_REGISTRY_RPC_URL         Ethereum RPC for ZKPassport's RootRegistry
 *                                (default: public Sepolia RPC on testnet, mainnet RPC on mainnet)
 *   ZKP_REGISTRY_CHAIN_ID        chain of that RootRegistry (default matches the RPC above).
 *   VK_VERSION                   circuit-release version to register the vks under and
 *                                enable (Field, default 1). Must match what consumer apps
 *                                pass in ServiceConfig.version.
 *                                Override BOTH to seed cross-chain roots — e.g. REAL passports
 *                                verified on the Aztec testnet need the MAINNET roots:
 *                                ZKP_REGISTRY_CHAIN_ID=1 ZKP_REGISTRY_RPC_URL=<mainnet rpc>
 *   VK_CIRCUITS                  comma-separated outer circuit names to accept from the
 *                                current circuit manifest (default "outer_count_5" — what
 *                                an age/nationality query with a bind resolves to)
 *   VK_HASH                      accept this exact vk hash instead of resolving VK_CIRCUITS
 *   OPRF_PK_HASH                 if set, also set_oprf_pk_hash (salted-nullifier support)
 *   DRY_RUN                      resolve + print everything, send nothing
 *
 * Fees: testnet uses the live SponsoredFPC (same 5.1.0-artifact pin + on-chain
 * verification as deploy-testnet.ts). Mainnet pays with the deployer's Fee Juice —
 * seeding costs a few small public txs, so the balance left from the deploy should
 * cover it (see deploy-mainnet.ts for bridging if not).
 */
import { type NoirCompiledContract, loadContractArtifact } from "@aztec/aztec.js/abi"
import { AztecAddress } from "@aztec/aztec.js/addresses"
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts"
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee"
import { Fr } from "@aztec/aztec.js/fields"
import { createAztecNodeClient } from "@aztec/aztec.js/node"
import { SPONSORED_FPC_SALT } from "@aztec/constants"
import { deriveStorageSlotInMap } from "@aztec/stdlib/hash"
import { deriveMasterMessageSigningSecretKey } from "@aztec/stdlib/keys"
import { EmbeddedWallet } from "@aztec/wallets/embedded"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import SponsoredFPCJson from "noir-contracts-5.1.0/artifacts/sponsored_fpc_contract-SponsoredFPC" with { type: "json" }
import { ZKPassportRegistryContract } from "../artifacts/ZKPassportRegistry.js"

// zkpassport_registry_contract::types registry ids
const REGISTRY_CERTIFICATE = 1n
const REGISTRY_CIRCUIT = 2n

/** Client-side proving is minutes-scale; never let the tx wait time out first. */
const WAIT = { timeout: 3600, interval: 2 } as const

const NETWORKS = {
  testnet: {
    nodeUrl: "https://v5.testnet.rpc.aztec-labs.com",
    // Mock/dev-mode passports prove against the SEPOLIA RootRegistry.
    registryChainId: 11155111,
    registryRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    sponsored: true,
  },
  mainnet: {
    nodeUrl: "https://aztec-mainnet.drpc.org",
    // Real passports prove against the ETHEREUM MAINNET RootRegistry.
    registryChainId: 1,
    registryRpcUrl: "https://ethereum-rpc.publicnode.com",
    sponsored: false,
  },
} as const
type Network = keyof typeof NETWORKS

// @zkpassport/registry is CJS-friendly; load it like voice's scripts do (its dependency
// tree pulls JSON imports that Node's strict ESM loader rejects).
const require = createRequire(import.meta.url)
type RegistryClientT = {
  getCircuitManifest(): Promise<{ version?: string; circuits: Record<string, { hash: string }> }>
  getLatestCertificateRoot(): Promise<string>
  getLatestCircuitRoot(): Promise<string>
}
function registryClient(chainId: number, rpcUrl: string): RegistryClientT {
  const { RegistryClient } = require("@zkpassport/registry") as {
    RegistryClient: new (o: { chainId: number; rpcUrl: string }) => RegistryClientT
  }
  return new RegistryClient({ chainId, rpcUrl })
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
  node: ReturnType<typeof createAztecNodeClient>,
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

/** "live at 2026-08-20T14:31:00Z (~87min)" — when a scheduled DPM change becomes readable. */
function liveAt(maturesAt: bigint, nowSecs: bigint): string {
  const at = new Date(Number(maturesAt) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
  if (maturesAt <= nowSecs) return `readable since ${at}`
  return `live at ${at} (~${Math.ceil(Number(maturesAt - nowSecs) / 60)}min)`
}

function resolveRegistryAddress(network: Network): { address: AztecAddress; source: string } {
  const env = process.env.ZKPASSPORT_REGISTRY_ADDRESS
  if (env) return { address: AztecAddress.fromStringUnsafe(env), source: "env" }
  for (const name of [`${network}.json`, `${network}-preview.json`]) {
    const path = fileURLToPath(new URL(`../deployments/${name}`, import.meta.url))
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

  const secret = process.env.ZKPASSPORT_DEPLOYER_SECRET
  if (!secret) {
    throw new Error(
      "ZKPASSPORT_DEPLOYER_SECRET is required — the sender must hold the registry's oracle/admin roles",
    )
  }
  const secretKey = Fr.fromString(secret)
  const salt = process.env.SALT ? Fr.fromString(process.env.SALT) : new Fr(0)
  const nodeUrl = process.env.AZTEC_NODE_URL ?? cfg.nodeUrl
  const { address: registryAddress, source } = resolveRegistryAddress(network)

  // ── Resolve the values to seed from ZKPassport's Ethereum RootRegistry ──────
  const zkpRpc = process.env.ZKP_REGISTRY_RPC_URL ?? cfg.registryRpcUrl
  const zkpChainId = process.env.ZKP_REGISTRY_CHAIN_ID
    ? Number(process.env.ZKP_REGISTRY_CHAIN_ID)
    : cfg.registryChainId
  const client = registryClient(zkpChainId, zkpRpc)
  const [certRoot, circuitRoot, manifest] = await Promise.all([
    client.getLatestCertificateRoot(),
    client.getLatestCircuitRoot(),
    client.getCircuitManifest(),
  ])
  const vkHashes: { name: string; hash: string }[] = []
  if (process.env.VK_HASH) {
    vkHashes.push({ name: "(VK_HASH env)", hash: process.env.VK_HASH })
  } else {
    const names = (process.env.VK_CIRCUITS ?? "outer_count_5").split(",").map((s) => s.trim())
    for (const name of names) {
      const entry = manifest.circuits[name]
      if (!entry?.hash) {
        throw new Error(
          `"${name}" not in the ZKPassport circuit manifest (v${manifest.version ?? "?"}) — available: ${Object.keys(manifest.circuits).join(", ")}`,
        )
      }
      vkHashes.push({ name, hash: entry.hash })
    }
  }
  console.log(
    `ZKPassport RootRegistry (chain ${zkpChainId}, manifest v${manifest.version ?? "?"}):`,
  )
  console.log(`  certificate root: ${certRoot}`)
  console.log(`  circuit root:     ${circuitRoot}`)
  for (const vk of vkHashes) console.log(`  vk ${vk.name}: ${vk.hash}`)
  // Circuit-release version the vks are registered under (registry: version => vk set).
  const vkVersionFr = new Fr(BigInt(process.env.VK_VERSION ?? "1"))
  console.log(`  vk version: ${vkVersionFr}`)

  // ── Connect + rebuild the deployer account ───────────────────────────────────
  const node = createAztecNodeClient(nodeUrl)
  const { nodeVersion, l1ChainId } = await node.getNodeInfo()
  console.log(`node ${nodeUrl}: version=${nodeVersion} l1ChainId=${l1ChainId}`)
  if (!nodeVersion.startsWith("5.2.") && !nodeVersion.startsWith("5.1.")) {
    throw new Error(`node version ${nodeVersion} is not 5.1.x/5.2.x`)
  }

  const wallet = await EmbeddedWallet.create(nodeUrl, {
    ephemeral: true,
    pxe: { proverEnabled: true },
  })
  const sender = await wallet.createSchnorrInitializerlessAccount(
    secretKey,
    salt,
    deriveMasterMessageSigningSecretKey(secretKey),
  )
  console.log(`sender (must be the registry's oracle + admin): ${sender.address}`)

  const instance = await node.getContract(registryAddress)
  if (!instance) throw new Error(`no contract on-chain at ${registryAddress} (${source})`)
  await wallet.registerContract(instance, ZKPassportRegistryContract.artifact)
  const registry = await ZKPassportRegistryContract.at(registryAddress, wallet)
  console.log(`registry: ${registryAddress} (from ${source})`)

  // Fees: sponsored on testnet (same 5.1.0-artifact pin + on-chain check as the deploy
  // scripts), the sender's Fee Juice on mainnet.
  let fee: { paymentMethod: SponsoredFeePaymentMethod } | undefined
  if (cfg.sponsored) {
    const fpcArtifact = loadContractArtifact(SponsoredFPCJson as NoirCompiledContract)
    const fpc = await getContractInstanceFromInstantiationParams(fpcArtifact, {
      salt: new Fr(SPONSORED_FPC_SALT),
    })
    const fpcOnChain = await node.getContract(fpc.address)
    if (!fpcOnChain || !fpcOnChain.currentContractClassId.equals(fpc.currentContractClassId)) {
      throw new Error(`SponsoredFPC at ${fpc.address} missing or class-mismatched on-chain`)
    }
    await wallet.registerContract(fpc, fpcArtifact)
    fee = { paymentMethod: new SponsoredFeePaymentMethod(fpc.address) }
    console.log(`sponsored FPC verified on-chain: ${fpc.address}`)
  }
  const sendOpts = { from: sender.address, ...(fee ? { fee } : {}), wait: WAIT }

  // ── Plan: compare against the registry's (delay-applied) current state ───────
  const nowSecs = BigInt(Math.floor(Date.now() / 1000))
  const roots = [
    { id: REGISTRY_CERTIFICATE, label: "certificate", root: certRoot },
    { id: REGISTRY_CIRCUIT, label: "circuit", root: circuitRoot },
  ]

  // Storage slots for the raw scheduled-change reads (see readScheduledChange).
  const layout = ZKPassportRegistryContract.storage
  const actions: string[] = []
  let pendingMaturity = 0
  for (const r of roots) {
    const rootFr = Fr.fromHexString(r.root)
    const pair = unwrap<{ latest: bigint }>(
      await registry.methods.get_latest_pair(r.id).simulate({ from: sender.address }),
    )
    const current = new Fr(pair.latest)
    if (current.equals(rootFr)) {
      console.log(`${r.label} root is already live in the registry — skipping`)
      continue
    }
    // LatestRootPair packs to 2 fields (latest, previous); post[0] is the scheduled latest.
    const sched = await readScheduledChange(
      node,
      registryAddress,
      layout.latest.slot,
      [new Fr(r.id)],
      2,
    )
    if (sched.post[0].equals(rootFr) && sched.maturesAt > nowSecs) {
      console.log(
        `${r.label} root ${r.root} is already pushed — ${liveAt(sched.maturesAt, nowSecs)} — skipping`,
      )
      pendingMaturity++
      continue
    }
    actions.push(`update_root(${r.label}): ${current} -> ${r.root}`)
  }
  for (const vk of vkHashes) {
    const hashFr = Fr.fromHexString(vk.hash)
    const accepted = unwrap<boolean>(
      await registry.methods.is_vk_accepted(vkVersionFr, hashFr).simulate({ from: sender.address }),
    )
    if (accepted) {
      console.log(`vk ${vk.name} is already accepted — skipping`)
      continue
    }
    const sched = await readScheduledChange(
      node,
      registryAddress,
      layout.accepted_vks.slot,
      [vkVersionFr, hashFr],
      1,
    )
    if (!sched.post[0].isZero() && sched.maturesAt > nowSecs) {
      console.log(
        `vk ${vk.name} is already scheduled — ${liveAt(sched.maturesAt, nowSecs)} — skipping`,
      )
      pendingMaturity++
      continue
    }
    actions.push(`add_accepted_vk(v${vkVersionFr.toBigInt()}, ${vk.name}): ${vk.hash}`)
  }
  {
    const enabled = unwrap<boolean>(
      await registry.methods.is_version_enabled(vkVersionFr).simulate({ from: sender.address }),
    )
    if (enabled) {
      console.log(`vk version ${vkVersionFr.toBigInt()} is already enabled — skipping`)
    } else {
      const sched = await readScheduledChange(
        node,
        registryAddress,
        layout.version_enabled.slot,
        [vkVersionFr],
        1,
      )
      if (!sched.post[0].isZero() && sched.maturesAt > nowSecs) {
        console.log(
          `vk version ${vkVersionFr.toBigInt()} enable is already scheduled — ${liveAt(sched.maturesAt, nowSecs)} — skipping`,
        )
        pendingMaturity++
      } else {
        actions.push(`set_version_status(v${vkVersionFr.toBigInt()}, true)`)
      }
    }
  }
  let oprfNeeded = false
  if (process.env.OPRF_PK_HASH) {
    const oprf = Fr.fromHexString(process.env.OPRF_PK_HASH)
    const sched = await readScheduledChange(
      node,
      registryAddress,
      layout.oprf_pk_hash.slot,
      [],
      1,
    )
    if (sched.post[0].equals(oprf)) {
      if (sched.maturesAt > nowSecs) {
        console.log(
          `oprf_pk_hash is already scheduled — ${liveAt(sched.maturesAt, nowSecs)} — skipping`,
        )
        pendingMaturity++
      } else {
        console.log("oprf_pk_hash is already live — skipping")
      }
    } else {
      oprfNeeded = true
      actions.push(`set_oprf_pk_hash: ${process.env.OPRF_PK_HASH}`)
    }
  }

  if (actions.length === 0) {
    if (pendingMaturity > 0) {
      console.log(
        `nothing to send — ${pendingMaturity} value(s) already pushed and still inside the DPM delay (maturity times above); re-run later to confirm`,
      )
    } else {
      console.log("registry is fully seeded — nothing to do")
    }
    return
  }
  console.log(`planned actions:\n  ${actions.join("\n  ")}`)
  if (process.env.DRY_RUN) {
    console.log("DRY_RUN set — stopping before any tx")
    return
  }

  // ── Execute (sequential txs; each is minutes of client-side proving) ─────────
  const seeded: Record<string, string> = {}
  for (const r of roots) {
    const rootFr = Fr.fromHexString(r.root)
    const pair = unwrap<{ latest: bigint }>(
      await registry.methods.get_latest_pair(r.id).simulate({ from: sender.address }),
    )
    const current = new Fr(pair.latest)
    if (current.equals(rootFr)) continue
    const sched = await readScheduledChange(
      node,
      registryAddress,
      layout.latest.slot,
      [new Fr(r.id)],
      2,
    )
    if (sched.post[0].equals(rootFr) && sched.maturesAt > nowSecs) continue // reported in the plan
    const call = registry.methods.update_root(r.id, rootFr, current, nowSecs)
    try {
      await call.simulate({ from: sender.address })
    } catch (e) {
      const msg = (e as Error).message ?? String(e)
      if (msg.includes("root already exists")) {
        console.log(
          `${r.label} root ${r.root} was already pushed (still inside the DPM delay) — ${liveAt(sched.maturesAt, nowSecs)} — skipping`,
        )
        continue
      }
      if (msg.includes("current root mismatch")) {
        console.log(
          `${r.label}: a different root (${sched.post[0]}) is scheduled — ${liveAt(sched.maturesAt, nowSecs)} — re-run after the delay. Skipping.`,
        )
        continue
      }
      throw e
    }
    console.log(`update_root(${r.label}, ${r.root}) — proving + sending...`)
    await call.send(sendOpts)
    console.log(`  done`)
    seeded[`${r.label}Root`] = r.root
  }

  for (const vk of vkHashes) {
    const hashFr = Fr.fromHexString(vk.hash)
    const accepted = unwrap<boolean>(
      await registry.methods.is_vk_accepted(vkVersionFr, hashFr).simulate({ from: sender.address }),
    )
    if (accepted) continue
    const sched = await readScheduledChange(
      node,
      registryAddress,
      layout.accepted_vks.slot,
      [vkVersionFr, hashFr],
      1,
    )
    if (!sched.post[0].isZero() && sched.maturesAt > nowSecs) continue // reported in the plan
    console.log(`add_accepted_vk(v${vkVersionFr.toBigInt()}, ${vk.name}, ${vk.hash}) — proving + sending...`)
    await registry.methods.add_accepted_vk(vkVersionFr, hashFr).send(sendOpts)
    console.log(`  done`)
    seeded[`vk:${vk.name}`] = vk.hash
  }

  {
    const enabled = unwrap<boolean>(
      await registry.methods.is_version_enabled(vkVersionFr).simulate({ from: sender.address }),
    )
    const sched = await readScheduledChange(
      node,
      registryAddress,
      layout.version_enabled.slot,
      [vkVersionFr],
      1,
    )
    const pending = !sched.post[0].isZero() && sched.maturesAt > nowSecs
    if (!enabled && !pending) {
      console.log(`set_version_status(v${vkVersionFr.toBigInt()}, true) — proving + sending...`)
      await registry.methods.set_version_status(vkVersionFr, true).send(sendOpts)
      console.log(`  done`)
      seeded[`version:${vkVersionFr.toBigInt()}`] = "enabled"
    }
  }

  if (process.env.OPRF_PK_HASH && oprfNeeded) {
    const oprf = Fr.fromHexString(process.env.OPRF_PK_HASH)
    console.log(`set_oprf_pk_hash(${oprf}) — proving + sending...`)
    await registry.methods.set_oprf_pk_hash(oprf).send(sendOpts)
    console.log(`  done`)
    seeded.oprfPkHash = oprf.toString()
  }

  const record = {
    network,
    nodeUrl,
    registry: registryAddress.toString(),
    sender: sender.address.toString(),
    zkpassportRegistryChainId: zkpChainId,
    circuitManifestVersion: manifest.version ?? null,
    certRoot,
    circuitRoot,
    vkHashes,
    seededThisRun: seeded,
    seededAt: new Date().toISOString(),
  }
  const outPath = fileURLToPath(new URL(`../deployments/${network}-seed.json`, import.meta.url))
  mkdirSync(fileURLToPath(new URL("../deployments", import.meta.url)), { recursive: true })
  writeFileSync(outPath, JSON.stringify(record, null, 2) + "\n")
  console.log(`wrote ${outPath}`)

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
