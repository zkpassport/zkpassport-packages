/**
 * Create (or re-derive) an initializerless Schnorr account and print its address.
 *
 * The account is generic: use it to mint the deployer, the registry admin, oracle, or
 * guardian, or any other role. The address is a pure function of (secret, salt): no
 * account-deploy tx, no funding, and nothing written to disk. A freshly minted secret
 * is printed exactly once; store it in a real secret manager, and export it under the
 * variable the consuming script expects (e.g. ZKPASSPORT_DEPLOYER_SECRET for the
 * deploy scripts, REGISTRY_ORACLE_SECRET / REGISTRY_ADMIN_SECRET for seeding). No
 * other script ever mints a secret.
 *
 * Usage: npm run account:testnet | npm run account:mainnet
 *
 * Env:
 *   AZTEC_NODE_URL  node RPC (defaults per network; only hosts the derivation wallet,
 *                   nothing is sent)
 *   ACCOUNT_SECRET  re-derive the address of this existing secret instead of minting
 *                   a new one
 *   SALT            account salt (default 0, reproducible)
 */
import { Fr } from "@aztec/aztec.js/fields"
import {
  type Network,
  connectAndCheckNode,
  createEphemeralWallet,
  defaultNodeUrl,
  deriveSchnorrAccount,
  saltFromEnv,
} from "./common.js"

const NETWORK = process.argv[2] as Network
if (NETWORK !== "testnet" && NETWORK !== "mainnet") {
  console.error("usage: tsx deployment/create-schnorr-account.ts <testnet|mainnet>")
  process.exit(1)
}

const NODE_URL = process.env.AZTEC_NODE_URL ?? defaultNodeUrl(NETWORK)

/** aztec-kit's loadOrCreateSecret: read the env var, or mint a fresh secret to echo back. */
function loadOrCreateSecret(envVar: string): { secretKey: Fr; generated: boolean } {
  const env = process.env[envVar]
  if (env) {
    return { secretKey: Fr.fromString(env), generated: false }
  }
  return { secretKey: Fr.random(), generated: true }
}

async function main() {
  const { secretKey, generated } = loadOrCreateSecret("ACCOUNT_SECRET")
  const salt = saltFromEnv()

  await connectAndCheckNode(NODE_URL, NETWORK)

  // Derive-only: no tx is ever sent here, so no proving.
  const wallet = await createEphemeralWallet(NODE_URL, false)
  const account = await deriveSchnorrAccount(wallet, secretKey, salt)
  console.log(`address (initializerless Schnorr, no deploy tx needed): ${account.address}`)

  if (generated) {
    console.log("The freshly minted secret is printed ONCE below and never written to disk.")
    console.log("Store it in a real secret manager now: it cannot be recovered. Rename the")
    console.log("variable to whatever the consuming script expects for this account's role.")
    // The leading space keeps the pasted command out of shell history
    // (HISTCONTROL=ignoreboth / HIST_IGNORE_SPACE).
    console.log(` export ACCOUNT_SECRET=${secretKey.toString()}`)
  } else {
    console.log("secret: reused from ACCOUNT_SECRET")
  }

  if (!salt.equals(new Fr(0))) {
    console.log(` export SALT=${salt.toString()}`)
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
