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
 *     $AZTEC/bin/aztec codegen target -o ../scripts/artifacts
 *
 * Env:
 *   AZTEC_NODE_URL              node RPC (default: the public v5 testnet endpoint)
 *   ZKPASSPORT_DEPLOYER_SECRET  hex Fr for the deployer account. Generated and echoed
 *                               as an `export` line when absent — re-export it so
 *                               re-runs resolve the same deployer (and registry).
 *   SALT                        account + contract salt (default 0, reproducible)
 *   REGISTRY_ADMIN / REGISTRY_ORACLE / REGISTRY_GUARDIAN
 *                               role addresses, all required. There is no deployer
 *                               fallback: putting a role on the deployer must be an
 *                               explicit choice.
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
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee"
import { ZKPassportRegistryContract } from "../artifacts/ZKPassportRegistry.js"
import {
  MODE_VALID_WITHIN_WINDOW,
  VALIDITY_WINDOW,
  WAIT,
  connectAndCheckNode,
  defaultNodeUrl,
  deriveDeployerAccount,
  loadOrCreateSecret,
  requiredRole,
  saltFromEnv,
  verifySponsoredFPC,
  writeDeploymentRecord,
} from "./common.js"

const NODE_URL = process.env.AZTEC_NODE_URL ?? defaultNodeUrl("testnet")

/** The delay this deployment's class was compiled with (see ../deploy.sh testnet). */
const INITIAL_DELAY = process.env.PREVIEW_DELAY ?? "86400"
const IS_PREVIEW = process.env.PREVIEW_DELAY !== undefined

// Preview and production classes differ (different INITIAL_DELAY ⇒ different class id
// ⇒ different address), so their manifests must not clobber each other.
const MANIFEST = `${IS_PREVIEW ? "testnet-preview" : "testnet"}.json`

async function main() {
  const { secretKey, generated } = loadOrCreateSecret("ZKPASSPORT_DEPLOYER_SECRET")
  const salt = saltFromEnv()

  if (IS_PREVIEW) {
    console.log(
      `PREVIEW build: INITIAL_DELAY=${INITIAL_DELAY}s — assuming ../deploy.sh testnet just compiled the registry with it`,
    )
  }

  const { node, nodeVersion, l1ChainId, rollupVersion } = await connectAndCheckNode(
    NODE_URL,
    "testnet",
  )

  const { wallet, account: deployer } = await deriveDeployerAccount(NODE_URL, secretKey, salt, true)
  console.log(`deployer (initializerless Schnorr, no deploy tx needed): ${deployer.address}`)

  const fpc = await verifySponsoredFPC(node, wallet)
  const paymentMethod = new SponsoredFeePaymentMethod(fpc.address)

  const admin = requiredRole("REGISTRY_ADMIN")
  const oracle = requiredRole("REGISTRY_ORACLE")
  const guardian = requiredRole("REGISTRY_GUARDIAN")
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
  writeDeploymentRecord(MANIFEST, manifest)

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
