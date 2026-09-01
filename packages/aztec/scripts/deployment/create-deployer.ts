/**
 * Create the ZKPassportRegistry deployer account and save its keys to a file.
 *
 * The deployer used by deploy-testnet.ts / deploy-mainnet.ts / seed-registry.ts is an
 * initializerless Schnorr account: its address is a pure function of (secret, salt) and
 * needs no account-deploy tx. "Creating" it therefore means deriving the address and
 * handling the secret, which differs by network:
 *
 *   - testnet: writes a `source`-able deployer-testnet.env next to package.json (chmod
 *     600; gitignored via the repo-root `*.env*` rule), so later runs are just:
 *     source deployer-testnet.env && PREVIEW_DELAY=7200 ./deploy.sh testnet
 *   - mainnet: never writes the secret to disk. It controls real funds and the registry
 *     admin role, and a plaintext file in the working tree is one `git clean -xd` away
 *     from being lost forever and readable by anything in node_modules. A freshly minted
 *     secret is printed exactly once — store it in a real secret manager; the deploy and
 *     seed scripts read ZKPASSPORT_DEPLOYER_SECRET from the environment.
 *
 * Funding:
 *   - testnet: nothing to fund — deploy and seeding pay via the SponsoredFPC, which this
 *     script verifies on-chain so the account is known deploy-ready.
 *   - mainnet: the script reports the account's Fee Juice balance. Actual bridging is
 *     deliberately left to deploy-mainnet.ts (run with L1_PRIVATE_KEY set): bridged Fee
 *     Juice is an unclaimed L1->L2 message until some L2 tx claims it, and a fresh
 *     account cannot pay for a standalone claim tx — the deploy tx consumes the claim as
 *     its own fee payment (FeeJuicePaymentMethodWithClaim). Pre-funding by hand instead:
 *     `aztec-wallet bridge-fee-juice` (printed below when the balance is empty).
 *
 * Safety (testnet): if the keys file already exists the script refuses to overwrite it
 * with a different secret — source the file (or delete it) first. Re-running with the
 * same ZKPASSPORT_DEPLOYER_SECRET exported is idempotent.
 *
 * Env:
 *   AZTEC_NODE_URL              node RPC (defaults per network, same as the deploy scripts)
 *   ZKPASSPORT_DEPLOYER_SECRET  reuse an existing secret instead of minting one
 *   SALT                        account + contract salt (default 0, reproducible)
 */
import { type NoirCompiledContract, loadContractArtifact } from "@aztec/aztec.js/abi"
import { getContractInstanceFromInstantiationParams } from "@aztec/aztec.js/contracts"
import { Fr } from "@aztec/aztec.js/fields"
import { createAztecNodeClient } from "@aztec/aztec.js/node"
import { FeeJuiceContract } from "@aztec/aztec.js/protocol"
import { SPONSORED_FPC_SALT } from "@aztec/constants"
import { deriveMasterMessageSigningSecretKey } from "@aztec/stdlib/keys"
import { EmbeddedWallet } from "@aztec/wallets/embedded"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { fileURLToPath } from "node:url"
import SponsoredFPCJson from "noir-contracts-5.1.0/artifacts/sponsored_fpc_contract-SponsoredFPC" with { type: "json" }

const NETWORK = process.argv[2]
if (NETWORK !== "testnet" && NETWORK !== "mainnet") {
  console.error("usage: tsx deployment/create-deployer.ts <testnet|mainnet>")
  process.exit(1)
}

const NODE_URL =
  process.env.AZTEC_NODE_URL ??
  (NETWORK === "testnet"
    ? "https://v5.testnet.rpc.aztec-labs.com"
    : "https://aztec-mainnet.drpc.org")

const KEYS_FILE = fileURLToPath(new URL(`../deployer-${NETWORK}.env`, import.meta.url))

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

async function main() {
  const { secretKey, generated } = loadOrCreateSecret("ZKPASSPORT_DEPLOYER_SECRET")
  const salt = process.env.SALT ? Fr.fromString(process.env.SALT) : new Fr(0)

  // Never silently replace saved keys: a lost deployer secret means a lost registry
  // admin/oracle role.
  if (NETWORK === "testnet" && existsSync(KEYS_FILE)) {
    const saved = readFileSync(KEYS_FILE, "utf8").match(
      /^export ZKPASSPORT_DEPLOYER_SECRET=(0x[0-9a-fA-F]+)$/m,
    )
    if (generated) {
      console.error(`${KEYS_FILE} already exists — not minting a new secret over it.`)
      console.error(`Either reuse it (source ${KEYS_FILE}) or remove the file first.`)
      process.exit(1)
    }
    if (saved && !Fr.fromString(saved[1]).equals(secretKey)) {
      console.error(`${KEYS_FILE} already holds a DIFFERENT secret than the environment.`)
      console.error("Refusing to overwrite it; remove the file first if that is intended.")
      process.exit(1)
    }
  }

  const node = createAztecNodeClient(NODE_URL)
  const { nodeVersion, l1ChainId, rollupVersion } = await node.getNodeInfo()
  console.log(
    `node ${NODE_URL}: version=${nodeVersion} l1ChainId=${l1ChainId} rollupVersion=${rollupVersion}`,
  )
  if (NETWORK === "mainnet" && l1ChainId !== 1) {
    throw new Error(`l1ChainId is ${l1ChainId}, not 1 — this node is not Aztec mainnet`)
  }
  if (!nodeVersion.startsWith("5.2.") && !nodeVersion.startsWith("5.1.")) {
    throw new Error(
      `node version ${nodeVersion} is not 5.1.x/5.2.x — this repo's toolchain and artifacts are pinned to 5.2.0`,
    )
  }

  // Derive-only: no tx is ever sent here, so no proving.
  const wallet = await EmbeddedWallet.create(NODE_URL, {
    ephemeral: true,
    pxe: { proverEnabled: false },
  })
  const deployer = await wallet.createSchnorrInitializerlessAccount(
    secretKey,
    salt,
    deriveMasterMessageSigningSecretKey(secretKey),
  )
  console.log(`deployer (initializerless Schnorr, no deploy tx needed): ${deployer.address}`)
  console.log(`secret: ${generated ? "freshly minted" : "reused from ZKPASSPORT_DEPLOYER_SECRET"}`)

  if (NETWORK === "testnet") {
    // Same verification as deploy-testnet.ts: fees for deploy + seeding are sponsored,
    // so a verified FPC means the account is deploy-ready with zero funding.
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
    console.log(
      `funding: none needed — SponsoredFPC ${fpc.address} verified on-chain pays deploy + seed fees`,
    )
  } else {
    const feeJuice = FeeJuiceContract.at(wallet)
    const { result: balanceRaw } = await feeJuice.methods
      .balance_of_public(deployer.address)
      .simulate({ from: deployer.address })
    const balance = BigInt(balanceRaw.toString())
    console.log(`funding: deployer Fee Juice balance is ${fj(balance)}`)
    if (balance === 0n) {
      console.log(
        "  The recommended path needs no pre-funding: run ./deploy.sh mainnet with " +
          "L1_PRIVATE_KEY=<key holding $AZTEC + ETH> — it bridges the estimated cost and " +
          "the deploy tx claims it as its own fee payment.",
      )
      console.log("  To pre-fund by hand instead (amount in Fee Juice wei, 1e18 = 1 FJ):")
      console.log(`    aztec-wallet bridge-fee-juice <amount> ${deployer.address} \\`)
      console.log(
        `      --node-url ${NODE_URL} --l1-rpc-urls <ethereum rpc> -c 1 --l1-private-key <key>`,
      )
      console.log("  (bridged juice becomes spendable when the deployer's first tx claims it)")
    }
  }

  if (NETWORK === "testnet") {
    const lines = [
      `# ZKPassportRegistry deployer keys — written by create-deployer.ts, ${new Date().toISOString()}`,
      `# network: ${NETWORK}   node: ${NODE_URL}`,
      `# deployer address (derived from secret + salt, no deploy tx): ${deployer.address}`,
      "# KEEP THIS FILE SAFE: the secret controls the registry admin/oracle roles.",
      `# Usage: source ${KEYS_FILE.split("/").pop()}`,
      `export ZKPASSPORT_DEPLOYER_SECRET=${secretKey.toString()}`,
      `export SALT=${salt.toString()}`,
      "",
    ]
    writeFileSync(KEYS_FILE, lines.join("\n"), { mode: 0o600 })
    console.log(`wrote ${KEYS_FILE} (mode 600, gitignored via the repo-root *.env* rule)`)

    console.log("---")
    console.log("next:")
    console.log(`  source ${KEYS_FILE}`)
    console.log("  PREVIEW_DELAY=7200 ./deploy.sh testnet   # then: npm run seed:testnet")
  } else {
    console.log("---")
    if (generated) {
      console.log("The freshly minted secret is printed ONCE below and never written to disk.")
      console.log("Store it in a real secret manager now — it controls the registry admin role")
      console.log("and the deployer's funds, and cannot be recovered.")
      console.log(`  ZKPASSPORT_DEPLOYER_SECRET=${secretKey.toString()}`)
      console.log(`  SALT=${salt.toString()}`)
    }
    console.log("next (with the secret exported from your secret manager):")
    console.log("  export ZKPASSPORT_DEPLOYER_SECRET=<secret>")
    if (!salt.equals(new Fr(0))) console.log(`  export SALT=${salt.toString()}`)
    console.log("  ./deploy.sh mainnet                      # then: npm run seed:mainnet")
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
