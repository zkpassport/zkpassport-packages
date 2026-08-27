/**
 * Deploy ZKPassportRegistry to Aztec mainnet.
 *
 * Same skeleton as deploy-testnet.ts (initializerless Schnorr deployer, deterministic
 * salt, precomputed address, idempotent re-runs, real proving) with one structural
 * difference: mainnet has NO SponsoredFPC, so the deployer pays from its own Fee Juice.
 * Fee Juice only enters L2 by bridging the fee asset ($AZTEC, which doubles as the
 * staking asset) from Ethereum L1 through the FeeJuicePortal — there is no faucet.
 *
 * The fee flow, in order:
 *   1. Estimate the deploy cost (simulation + current base fees, then a 2x buffer).
 *   2. If the deployer's L2 Fee Juice balance covers it → deploy, paying from balance.
 *   3. Else, if L1_PRIVATE_KEY is set → bridge the shortfall from that L1 account
 *      (it must hold $AZTEC for the amount and ETH for gas; the portal manager sends
 *      approve + deposit), poll until the L1→L2 message is available (minutes), and
 *      deploy with FeeJuicePaymentMethodWithClaim — the deploy tx itself consumes the
 *      claim. A claim is single-use: if the deploy then fails, re-running spends the
 *      now-claimed balance via path 2 rather than re-bridging.
 *   4. Else → print the funding shortfall and exact instructions, and exit non-zero.
 *
 * Preferred entry point: ../deploy.sh mainnet — it compiles the registry first and
 * supports PREVIEW_DELAY builds (see that script).
 *
 * Env:
 *   AZTEC_NODE_URL              node RPC (default: the public mainnet endpoint)
 *   ZKPASSPORT_DEPLOYER_SECRET  hex Fr for the deployer account. Generated and echoed
 *                               as an `export` line when absent — re-export it so
 *                               re-runs resolve the same deployer (and registry).
 *                               On mainnet this secret controls real funds and the
 *                               registry admin role: keep it safe.
 *   SALT                        account + contract salt (default 0, reproducible)
 *   REGISTRY_ADMIN / REGISTRY_ORACLE / REGISTRY_GUARDIAN
 *                               role addresses; each defaults to the deployer.
 *   L1_RPC_URL                  Ethereum mainnet RPC (default: publicnode)
 *   L1_PRIVATE_KEY              L1 key holding $AZTEC + ETH; enables the auto-bridge
 *   FEE_JUICE_AMOUNT            override the bridged amount (Fee Juice wei, 1e18 = 1 FJ)
 *   DRY_RUN                     run every pre-flight check (node, address, cost
 *                               estimate, balance, funding decision) and stop before
 *                               any L1 or L2 transaction.
 *   PREVIEW_DELAY               seconds; set by ../deploy.sh when it patches
 *                               INITIAL_DELAY for a preview build. Only recorded here.
 *
 * This deploys ONLY the registry, which comes up empty — see deploy-testnet.ts for the
 * seeding steps and the DelayedPublicMutable delay caveat.
 */
import { AztecAddress } from "@aztec/aztec.js/addresses"
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum"
import { FeeJuicePaymentMethodWithClaim } from "@aztec/aztec.js/fee"
import { Fr } from "@aztec/aztec.js/fields"
import { createLogger } from "@aztec/aztec.js/log"
import { isL1ToL2MessageReady } from "@aztec/aztec.js/messaging"
import { createAztecNodeClient } from "@aztec/aztec.js/node"
import { FeeJuiceContract } from "@aztec/aztec.js/protocol"
import { createEthereumChain } from "@aztec/ethereum/chain"
import { createExtendedL1Client } from "@aztec/ethereum/client"
import { deriveMasterMessageSigningSecretKey } from "@aztec/stdlib/keys"
import { EmbeddedWallet } from "@aztec/wallets/embedded"
import { mkdirSync, writeFileSync } from "fs"
import { fileURLToPath } from "node:url"
import { ZKPassportRegistryContract } from "../artifacts/ZKPassportRegistry.js"

const NODE_URL = process.env.AZTEC_NODE_URL ?? "https://aztec-mainnet.drpc.org"
const L1_RPC_URL = process.env.L1_RPC_URL ?? "https://ethereum-rpc.publicnode.com"

/** zkpassport_registry_contract::types::MODE_VALID_WITHIN_WINDOW — the deployment default. */
const MODE_VALID_WITHIN_WINDOW = 3
/** Production validity window in seconds, matching L1's registry deployments (run-e2e.ts). */
const VALIDITY_WINDOW = 86400n

/** Client-side proving is minutes-scale; never let the tx wait time out first. */
const WAIT = { timeout: 3600, interval: 2 } as const

/** Estimated cost → bridge amount: cover wallet gas padding and base-fee drift. */
const FEE_BUFFER_NUMERATOR = 2n

/** The delay this deployment's class was compiled with (see ../deploy.sh). */
const INITIAL_DELAY = process.env.PREVIEW_DELAY ?? "86400"
const IS_PREVIEW = process.env.PREVIEW_DELAY !== undefined

const MANIFEST = fileURLToPath(
  new URL(`../deployments/${IS_PREVIEW ? "mainnet-preview" : "mainnet"}.json`, import.meta.url),
)

const ONE_FJ = 10n ** 18n

function fj(wei: bigint): string {
  const whole = wei / ONE_FJ
  const frac = ((wei % ONE_FJ) * 10000n) / ONE_FJ
  return `${whole}.${frac.toString().padStart(4, "0")} FJ`
}

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  const { secretKey, generated } = loadOrCreateSecret("ZKPASSPORT_DEPLOYER_SECRET")
  const salt = process.env.SALT ? Fr.fromString(process.env.SALT) : new Fr(0)

  if (IS_PREVIEW) {
    console.log(
      `PREVIEW build: INITIAL_DELAY=${INITIAL_DELAY}s — assuming ../deploy.sh just compiled the registry with it`,
    )
  }

  const node = createAztecNodeClient(NODE_URL)
  const { nodeVersion, l1ChainId, rollupVersion } = await node.getNodeInfo()
  console.log(
    `node ${NODE_URL}: version=${nodeVersion} l1ChainId=${l1ChainId} rollupVersion=${rollupVersion}`,
  )
  if (l1ChainId !== 1) {
    throw new Error(
      `l1ChainId is ${l1ChainId}, not 1 — this node is not Aztec mainnet (use deploy-testnet.ts for testnet)`,
    )
  }
  // v5.1.x and v5.2.x interoperate (protocol circuits are byte-identical — see the
  // v5.2.0 release notes); mainnet nodes still report 5.1.0 client binaries.
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
  let deployed = Boolean(existing)
  if (existing) {
    console.log("registry is already deployed at this address — nothing to do")
  } else {
    // ---- Fee decision: estimate cost, read balance, pick a funding path ----------
    console.log("estimating deploy cost (simulation, no tx)...")
    const sim = await deployMethod.simulate({
      from: deployer.address,
      skipFeeEnforcement: true,
      includeMetadata: true,
    })
    const billed = (sim as any).gasUsed.billedGas as { daGas: number; l2Gas: number }
    const fees = await node.getCurrentMinFees()
    const cost = BigInt(billed.daGas) * fees.feePerDaGas + BigInt(billed.l2Gas) * fees.feePerL2Gas
    const needed = cost * FEE_BUFFER_NUMERATOR
    console.log(
      `estimated cost: ${fj(cost)} (${billed.daGas} DA + ${billed.l2Gas} L2 gas at feePerDaGas=${fees.feePerDaGas}, feePerL2Gas=${fees.feePerL2Gas}); budgeting ${fj(needed)}`,
    )

    const feeJuice = FeeJuiceContract.at(wallet)
    const { result: balanceRaw } = await feeJuice.methods
      .balance_of_public(deployer.address)
      .simulate({ from: deployer.address })
    const balance = BigInt(balanceRaw.toString())
    console.log(`deployer Fee Juice balance: ${fj(balance)}`)

    const funded = balance >= needed
    const canBridge = Boolean(process.env.L1_PRIVATE_KEY)
    const plan = funded
      ? "pay from balance"
      : canBridge
        ? "bridge from L1, claim in the deploy tx"
        : "UNFUNDED"
    console.log(`funding plan: ${plan}`)

    if (process.env.DRY_RUN) {
      console.log("DRY_RUN set — all pre-flight checks passed, stopping before any transaction")
      return
    }

    let paymentMethod: FeeJuicePaymentMethodWithClaim | undefined
    if (!funded && canBridge) {
      const amount = process.env.FEE_JUICE_AMOUNT
        ? BigInt(process.env.FEE_JUICE_AMOUNT)
        : needed - balance
      console.log(`bridging ${fj(amount)} from L1 via ${L1_RPC_URL}...`)
      const chain = createEthereumChain([L1_RPC_URL], 1)
      const l1Client = createExtendedL1Client(
        chain.rpcUrls,
        process.env.L1_PRIVATE_KEY as `0x${string}`,
        chain.chainInfo,
      )
      const portal = await L1FeeJuicePortalManager.new(
        node,
        l1Client,
        createLogger("deploy:bridge"),
      )
      // No faucet on mainnet: this transfers the L1 signer's own $AZTEC balance.
      const claim = await portal.bridgeTokensPublic(deployer.address, amount, false)
      console.log(`bridged; waiting for the L1->L2 message (checks every 30s, can take a while)...`)
      const messageHash = Fr.fromHexString(claim.messageHash)
      const deadline = Date.now() + 60 * 60_000
      while (!(await isL1ToL2MessageReady(node, messageHash))) {
        if (Date.now() > deadline) {
          throw new Error(
            `L1->L2 message ${claim.messageHash} still unavailable after 60min — the claim is NOT lost; ` +
              `re-run later and, once the message lands, the claim can be consumed (or the balance re-checked).`,
          )
        }
        await sleep(30_000)
      }
      console.log("message available — deploying with claim-and-pay")
      paymentMethod = new FeeJuicePaymentMethodWithClaim(deployer.address, {
        claimAmount: claim.claimAmount,
        claimSecret: claim.claimSecret,
        messageLeafIndex: claim.messageLeafIndex,
      })
    } else if (!funded) {
      console.error("---")
      console.error(`deployer ${deployer.address} holds ${fj(balance)} but needs ~${fj(needed)}.`)
      console.error("Fund it by bridging the fee asset ($AZTEC) from Ethereum L1, either by")
      console.error(
        "  re-running with L1_PRIVATE_KEY=<key holding $AZTEC + ETH> in the env, or manually:",
      )
      console.error(`  aztec-wallet bridge-fee-juice ${needed - balance} ${deployer.address} \\`)
      console.error(
        `    --node-url ${NODE_URL} --l1-rpc-urls ${L1_RPC_URL} -c 1 --l1-private-key <key>`,
      )
      process.exit(1)
    }

    console.log("deploying (client-side proving, takes minutes)...")
    const t0 = Date.now()
    const { contract } = await deployMethod.send({
      from: deployer.address,
      ...(paymentMethod ? { fee: { paymentMethod } } : {}),
      wait: WAIT,
    })
    console.log(`deployed in ${((Date.now() - t0) / 1000).toFixed(1)}s at ${contract.address}`)
    const check = await node.getContract(instance.address)
    if (!check) throw new Error("deploy tx mined but the instance is not visible on-chain")
    deployed = true
  }

  if (!deployed) return

  const manifest = {
    network: "mainnet",
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
    `NOTE: the registry is deployed but EMPTY. Next steps (separate txs, each paying fees, then a ${delayHours}h ` +
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
