/**
 * Derive the ZKPassportRegistry deployer account.
 *
 * The deployer used by deploy-testnet.ts / deploy-mainnet.ts / seed-registry.ts is an
 * initializerless Schnorr account: its address is a pure function of (secret, salt) and
 * needs no account-deploy tx. "Creating" it therefore means deriving the address from
 * ZKPASSPORT_DEPLOYER_SECRET, or from a freshly minted secret printed exactly once.
 *
 * The secret is never written to disk, on any network: a plaintext key file in the
 * working tree is one `git clean -xd` away from being lost forever and readable by
 * anything in node_modules. Operators should store it in a real secret manager; the
 * deploy and seed scripts read ZKPASSPORT_DEPLOYER_SECRET from the environment.
 *
 * Funding:
 *   - testnet: nothing to fund. Deployment and seeding are paid via the SponsoredFPC, which this
 *     script verifies on-chain so the account is known deploy-ready.
 *   - mainnet: the script reports the account's Fee Juice balance. Actual bridging is
 *     deliberately left to deploy-mainnet.ts (run with L1_PRIVATE_KEY set): bridged Fee
 *     Juice is an unclaimed L1->L2 message until some L2 tx claims it, and a fresh
 *     account cannot pay for a standalone claim tx. The deploy tx consumes the claim as
 *     its own fee payment (FeeJuicePaymentMethodWithClaim). Pre-funding by hand instead:
 *     `aztec-wallet bridge-fee-juice` (printed below when the balance is empty).
 *
 * Env:
 *   AZTEC_NODE_URL              node RPC (defaults per network, same as the deploy scripts)
 *   ZKPASSPORT_DEPLOYER_SECRET  reuse an existing secret instead of minting one
 *   SALT                        account + contract salt (default 0, reproducible)
 */
import { Fr } from "@aztec/aztec.js/fields"
import { FeeJuiceContract } from "@aztec/aztec.js/protocol"
import {
  type Network,
  connectAndCheckNode,
  defaultNodeUrl,
  deriveDeployerAccount,
  fj,
  loadOrCreateSecret,
  saltFromEnv,
  verifySponsoredFPC,
} from "./common.js"

const NETWORK = process.argv[2] as Network
if (NETWORK !== "testnet" && NETWORK !== "mainnet") {
  console.error("usage: tsx deployment/create-deployer.ts <testnet|mainnet>")
  process.exit(1)
}

const NODE_URL = process.env.AZTEC_NODE_URL ?? defaultNodeUrl(NETWORK)

async function main() {
  const { secretKey, generated } = loadOrCreateSecret("ZKPASSPORT_DEPLOYER_SECRET")
  const salt = saltFromEnv()

  const { node } = await connectAndCheckNode(NODE_URL, NETWORK)

  // Derive-only: no tx is ever sent here, so no proving.
  const { wallet, account: deployer } = await deriveDeployerAccount(
    NODE_URL,
    secretKey,
    salt,
    false,
  )
  console.log(`deployer (initializerless Schnorr, no deploy tx needed): ${deployer.address}`)
  console.log(`secret: ${generated ? "freshly minted" : "reused from ZKPASSPORT_DEPLOYER_SECRET"}`)

  if (NETWORK === "testnet") {
    // Same verification as deploy-testnet.ts: fees for deploy + seeding are sponsored,
    // so a verified FPC means the account is deploy-ready with zero funding.
    await verifySponsoredFPC(node)
    console.log("funding: none needed, the SponsoredFPC pays deploy + seed fees")
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

  console.log("---")
  if (generated) {
    console.log("The freshly minted secret is printed ONCE below and never written to disk.")
    console.log("Store it in a real secret manager now: it controls the registry admin/oracle")
    console.log("roles and any funds the deployer holds, and cannot be recovered.")
    console.log(`  ZKPASSPORT_DEPLOYER_SECRET=${secretKey.toString()}`)
    console.log(`  SALT=${salt.toString()}`)
  }

  console.log("next (with the secret exported from your secret manager):")
  console.log("  export ZKPASSPORT_DEPLOYER_SECRET=<secret>")
  console.log("  export REGISTRY_ADMIN=<addr> REGISTRY_ORACLE=<addr> REGISTRY_GUARDIAN=<addr>")

  if (!salt.equals(new Fr(0))) {
    console.log(`  export SALT=${salt.toString()}`)
  }

  if (NETWORK === "testnet") {
    console.log("  PREVIEW_DELAY=3600 ./deploy.sh testnet   # then: npm run seed:testnet")
  } else {
    console.log("  ./deploy.sh mainnet                      # then: npm run seed:mainnet")
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
