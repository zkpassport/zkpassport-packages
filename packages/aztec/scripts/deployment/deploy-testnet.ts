/**
 * Deploy ZKPassportRegistry to the public Aztec testnet.
 *
 * Patterns borrowed from aztec-kit (and the upstream `@aztec/aztec/deploy` framework):
 *   - the deployer is an initializerless Schnorr account derived from a secret — its
 *     address is a pure function of (secret, salt) and needs no account-deploy tx;
 *   - fees are paid by the testnet's SponsoredFPC — no Sepolia ETH, no fee-juice
 *     bridging (the alternative: bridge Fee Juice from L1 with `aztec-wallet
 *     bridge-fee-juice`, which needs a funded Sepolia account);
 *   - deterministic salt (default 0) makes the run idempotent: the registry address is
 *     precomputed, and if it is already on-chain the script reports it and exits
 *     instead of deploying a duplicate;
 *   - proving is real (`proverEnabled: true`) — testnet rejects simulated proofs.
 *
 * Why not `runDeployment` from `@aztec/aztec/deploy` directly: its sponsored fee policy
 * derives the FPC address from the 5.2.0 artifact (0x2ece60…), but the live testnet's
 * SponsoredFPC was deployed from the 5.1.0 artifact (0x130925…, class 0x184e81…).
 * We pin the 5.1.0 artifact via the `noir-contracts-5.1.0` npm alias, derive the
 * instance ourselves, and verify it against the chain before sending anything.
 *
 * Mainnet: protocol-compatible with this stack (v5.1/v5.2 interoperate per the v5.2.0
 * release notes) but has NO SponsoredFPC — deploying there needs a fee-juice payment
 * mode (bridge the fee asset from Ethereum L1) that this script does not implement yet.
 *
 * Preferred entry point: ../deploy.sh testnet — it compiles the registry first (so the
 * deployed class always matches the source) and supports PREVIEW_DELAY builds. Run
 * `npm run deploy:testnet` directly only when target/ is already a fresh production
 * build (same requirement as run-e2e.ts):
 *   cd ../zkpassport.nr && $AZTEC/bin/aztec-nargo compile && \
 *     $AZTEC/bin/aztec codegen target -o ../scripts/src/artifacts
 *
 * Env:
 *   AZTEC_NODE_URL              node RPC (default: the public v5 testnet endpoint)
 *   ZKPASSPORT_DEPLOYER_SECRET  hex Fr for the deployer account. Generated and echoed
 *                               as an `export` line when absent — re-export it so
 *                               re-runs resolve the same deployer (and registry).
 *   SALT                        account + contract salt (default 0, reproducible)
 *   REGISTRY_ADMIN / REGISTRY_ORACLE / REGISTRY_GUARDIAN
 *                               role addresses; each defaults to the deployer.
 *   DRY_RUN                     if set, run every pre-flight check (node version, FPC
 *                               on-chain verification, address derivation) and stop
 *                               before sending the deploy tx.
 *   PREVIEW_DELAY               seconds; set by ../deploy.sh testnet when it patches
 *                               INITIAL_DELAY for a preview build. This script only
 *                               RECORDS it (manifest + messaging) — setting it here
 *                               without the wrapper's recompile deploys whatever delay
 *                               target/ was last compiled with.
 *
 * This deploys ONLY the registry, which comes up empty: no accepted VKs, no roots, no
 * OPRF key hash. Seeding those (update_root / add_accepted_vk / set_version_status / set_oprf_pk_hash) is a
 * follow-up step — and each seeded value takes INITIAL_DELAY (24h) of real time before
 * private verifiers can read it. There is no time-warp on a real network.
 */
import { type NoirCompiledContract, loadContractArtifact } from "@aztec/aztec.js/abi"
import { AztecAddress } from "@aztec/aztec.js/addresses"
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts"
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee"
import { Fr } from "@aztec/aztec.js/fields"
import { createAztecNodeClient } from "@aztec/aztec.js/node"
import { SPONSORED_FPC_SALT } from "@aztec/constants"
import { deriveMasterMessageSigningSecretKey } from "@aztec/stdlib/keys"
import { EmbeddedWallet } from "@aztec/wallets/embedded"
import { mkdirSync, writeFileSync } from "fs"
import { fileURLToPath } from "node:url"
import SponsoredFPCJson from "noir-contracts-5.1.0/artifacts/sponsored_fpc_contract-SponsoredFPC" with { type: "json" }
import { ZKPassportRegistryContract } from "../artifacts/ZKPassportRegistry.js"

const NODE_URL = process.env.AZTEC_NODE_URL ?? "https://v5.testnet.rpc.aztec-labs.com"

/** zkpassport_registry_contract::types::MODE_VALID_WITHIN_WINDOW — the deployment default. */
const MODE_VALID_WITHIN_WINDOW = 3
/** Production validity window in seconds, matching L1's registry deployments (run-e2e.ts). */
const VALIDITY_WINDOW = 86400n

/** Client-side proving is minutes-scale; never let the tx wait time out first. */
const WAIT = { timeout: 3600, interval: 2 } as const

/** The delay this deployment's class was compiled with (see ../deploy.sh testnet). */
const INITIAL_DELAY = process.env.PREVIEW_DELAY ?? "86400"
const IS_PREVIEW = process.env.PREVIEW_DELAY !== undefined

// Preview and production classes differ (different INITIAL_DELAY ⇒ different class id
// ⇒ different address), so their manifests must not clobber each other.
const MANIFEST = fileURLToPath(
  new URL(`../deployments/${IS_PREVIEW ? "testnet-preview" : "testnet"}.json`, import.meta.url),
)

/** aztec-kit's loadOrCreateSecret: read the env var, or mint a fresh secret to echo back. */
function loadOrCreateSecret(envVar: string): { secretKey: Fr; generated: boolean } {
  const env = process.env[envVar]
  if (env) return { secretKey: Fr.fromString(env), generated: false }
  return { secretKey: Fr.random(), generated: true }
}

function roleOverride(envVar: string): AztecAddress | undefined {
  const env = process.env[envVar]
  return env ? AztecAddress.fromStringUnsafe(env) : undefined
}

async function main() {
  const { secretKey, generated } = loadOrCreateSecret("ZKPASSPORT_DEPLOYER_SECRET")
  const salt = process.env.SALT ? Fr.fromString(process.env.SALT) : new Fr(0)

  if (IS_PREVIEW) {
    console.log(
      `PREVIEW build: INITIAL_DELAY=${INITIAL_DELAY}s — assuming ../deploy.sh testnet just compiled the registry with it`,
    )
  }

  const node = createAztecNodeClient(NODE_URL)
  const { nodeVersion, l1ChainId, rollupVersion } = await node.getNodeInfo()
  console.log(
    `node ${NODE_URL}: version=${nodeVersion} l1ChainId=${l1ChainId} rollupVersion=${rollupVersion}`,
  )
  // Networks are version-dependent; a mismatched wallet fails in ways that look like
  // anything but a version mismatch, so refuse early. v5.1.x is accepted alongside
  // v5.2.x: per the v5.2.0 release notes the two interoperate (protocol circuits are
  // byte-identical), and mainnet nodes still report 5.1.0 client binaries.
  if (!nodeVersion.startsWith("5.2.") && !nodeVersion.startsWith("5.1.")) {
    throw new Error(
      `node version ${nodeVersion} is not 5.1.x/5.2.x — this repo's toolchain and artifacts are pinned to 5.2.0`,
    )
  }

  const wallet = await EmbeddedWallet.create(NODE_URL, {
    ephemeral: true,
    pxe: { proverEnabled: true },
  })

  const deployer = await wallet.createSchnorrInitializerlessAccount(
    secretKey,
    salt,
    deriveMasterMessageSigningSecretKey(secretKey),
  )
  console.log(`deployer (initializerless Schnorr, no deploy tx needed): ${deployer.address}`)

  // The testnet's SponsoredFPC. Derive the instance from the pinned 5.1.0 artifact and
  // verify it against the chain — a mismatch here means the network swapped its FPC and
  // fee payment would fail with something far less legible than this error.
  const fpcArtifact = loadContractArtifact(SponsoredFPCJson as NoirCompiledContract)
  const fpc = await getContractInstanceFromInstantiationParams(fpcArtifact, {
    salt: new Fr(SPONSORED_FPC_SALT),
  })
  const fpcOnChain = await node.getContract(fpc.address)
  if (!fpcOnChain) {
    throw new Error(
      `SponsoredFPC not found on-chain at derived address ${fpc.address} — the network's FPC no longer matches the pinned 5.1.0 artifact`,
    )
  }
  if (!fpcOnChain.currentContractClassId.equals(fpc.currentContractClassId)) {
    throw new Error(
      `SponsoredFPC class mismatch at ${fpc.address}: on-chain ${fpcOnChain.currentContractClassId} vs artifact ${fpc.currentContractClassId}`,
    )
  }
  await wallet.registerContract(fpc, fpcArtifact)
  const paymentMethod = new SponsoredFeePaymentMethod(fpc.address)
  console.log(`sponsored FPC verified on-chain: ${fpc.address}`)

  const admin = roleOverride("REGISTRY_ADMIN") ?? deployer.address
  const oracle = roleOverride("REGISTRY_ORACLE") ?? deployer.address
  const guardian = roleOverride("REGISTRY_GUARDIAN") ?? deployer.address
  console.log(
    `roles: admin=${admin} oracle=${oracle} guardian=${guardian} mode=${MODE_VALID_WITHIN_WINDOW} window=${VALIDITY_WINDOW}`,
  )

  // Explicit salt + deployer pin the address before send, making re-runs idempotent.
  const deployMethod = ZKPassportRegistryContract.deploy(
    wallet,
    admin,
    oracle,
    guardian,
    MODE_VALID_WITHIN_WINDOW,
    VALIDITY_WINDOW,
    { salt, deployer: deployer.address },
  )
  const instance = await deployMethod.getInstance()
  console.log(`registry address (deterministic): ${instance.address}`)

  const existing = await node.getContract(instance.address)
  if (existing) {
    console.log("registry is already deployed at this address — nothing to do")
  } else if (process.env.DRY_RUN) {
    console.log("DRY_RUN set — all pre-flight checks passed, stopping before the deploy tx")
    return
  } else {
    console.log("deploying (client-side proving, takes minutes)...")
    const t0 = Date.now()
    const { contract } = await deployMethod.send({
      from: deployer.address,
      fee: { paymentMethod },
      wait: WAIT,
    })
    console.log(`deployed in ${((Date.now() - t0) / 1000).toFixed(1)}s at ${contract.address}`)
    const check = await node.getContract(instance.address)
    if (!check) throw new Error("deploy tx mined but the instance is not visible on-chain")
  }

  const manifest = {
    network: "testnet",
    nodeUrl: NODE_URL,
    l1ChainId: l1ChainId.toString(),
    rollupVersion: rollupVersion.toString(),
    nodeVersion,
    registry: instance.address.toString(),
    deployer: deployer.address.toString(),
    roles: { admin: admin.toString(), oracle: oracle.toString(), guardian: guardian.toString() },
    mode: MODE_VALID_WITHIN_WINDOW,
    window: VALIDITY_WINDOW.toString(),
    initialDelay: INITIAL_DELAY,
    salt: salt.toString(),
    sponsoredFPC: fpc.address.toString(),
    deployedAt: new Date().toISOString(),
  }
  mkdirSync(fileURLToPath(new URL("../deployments", import.meta.url)), { recursive: true })
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n")
  console.log(`wrote ${MANIFEST}`)

  console.log("---")
  if (generated) console.log(`export ZKPASSPORT_DEPLOYER_SECRET=${secretKey.toString()}`)
  console.log(`export ZKPASSPORT_REGISTRY_ADDRESS=${instance.address.toString()}`)
  const delayHours = (Number(INITIAL_DELAY) / 3600).toFixed(1)
  console.log(
    `NOTE: the registry is deployed but EMPTY. Next steps (separate txs, then a ${delayHours}h ` +
      "DelayedPublicMutable delay before private verifiers see them): " +
      "update_root(certificate), update_root(circuit), add_accepted_vk, set_version_status, set_oprf_pk_hash.",
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
