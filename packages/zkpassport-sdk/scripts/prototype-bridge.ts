/**
 * PROTOTYPE — throwaway spike, not for merge. Step 2 of 3 (step 1: prototype-node-proofs.ts,
 * step 3: prototype-anvil.ts).
 *
 * Question: does a full request survive the bridge? The SDK creates a request against a local
 * relay; a headless "app stand-in" parses the request URL, joins the bridge the way
 * zkpassport-mobile-app does, sends accept → 5 proofs → done, and the SDK verifies what it
 * received with verify({ devMode: true, verifierMode: "local" }). Flow: prototype-flow.ts.
 *
 * Relay: the bridge relay server, started in-process (rate limits off,
 * memory store). Set RELAY_DIR if it isn't cloned at ~/bridge-relay.
 * Registry: Sepolia (devMode).
 *
 * Run from the repo root: bun packages/zkpassport-sdk/scripts/prototype-bridge.ts
 */
import { runBridgeFlow } from "./prototype-flow"
import { log } from "./prototype-prove"

runBridgeFlow().then(
  ({ verification }) => {
    log(
      verification.verified
        ? "ANSWER: yes — the request survives the bridge and the proofs verify"
        : "ANSWER: no — see results above",
    )
    process.exit(0)
  },
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
