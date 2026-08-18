/**
 * Task 13 — sandbox end-to-end with REAL client-IVC proving.
 *
 * Deploys ZKPassportRegistry + AgeGate to a local Aztec network, seeds the
 * certificate/circuit roots and the accepted VK hash, warps chain time past the
 * registry's 24h DelayedPublicMutable delay, and then executes a real private
 * `claim()` transaction whose proof is produced by the local PXE's client-IVC
 * prover. That last part is the point: only real proving enforces the
 * `verify_proof_with_type` recursion constraint, which TXE cannot do.
 *
 * Three outcomes are asserted:
 *   CLAIM MINED           — the real proof verifies and the tx lands
 *   DOUBLE CLAIM REJECTED — the uniqueness nullifier collides
 *   TAMPERED PROOF REJECTED — a one-bit-flipped proof fails client-side proving
 *
 * The tampered control is the proving-mode canary: if it *succeeds*, proving was
 * simulated and the run is meaningless.
 */
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import { Capsule } from '@aztec/aztec.js/tx';
import { createAztecNodeDebugClient } from '@aztec/stdlib/interfaces/client';
import { EmbeddedWallet } from '@aztec/wallets/embedded';
import { registerInitialLocalNetworkAccountsInWallet } from '@aztec/wallets/testing';
import { readFileSync } from 'fs';
import { AgeGateContract } from './artifacts/AgeGate.js';
import { ZKPassportRegistryContract } from './artifacts/ZKPassportRegistry.js';

const NODE_URL = process.env.AZTEC_NODE_URL ?? 'http://localhost:8080';

/** Must match zkpassport_core::constants::PROOF_CAPSULE_SLOT. */
const PROOF_CAPSULE_SLOT = new Fr(1n);
/** Must match zkpassport_registry_contract::types::INITIAL_DELAY (override only for the sed fallback). */
const DELAY = BigInt(process.env.E2E_DELAY_SECONDS ?? '86400');
/** Registry ids: zkpassport_registry_contract::types::REGISTRY_{CERTIFICATE,CIRCUIT}. */
const REGISTRY_CERTIFICATE = 1n;
const REGISTRY_CIRCUIT = 2n;

const VK_FIELDS = 115;
const PROOF_FIELDS = 458;

/** Client-IVC proving is minutes-scale; never let the tx wait time out first. */
const WAIT = { timeout: 3600, interval: 1 } as const;

type Fixture = {
  vkeyFields: string[];
  proof: string[];
  publicInputs: string[];
  vkeyHashBB: string;
  certificateRegistryRoot: string;
  circuitRegistryRoot: string;
  nowTimestamp: number;
};

const FIXTURE: Fixture = JSON.parse(
  readFileSync(new URL('../../harness/fixtures/outer_count_4_age.json', import.meta.url), 'utf8'),
);

const started = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${msg}`);

async function timed<T>(label: string, fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const out = await fn();
  const secs = (Date.now() - t0) / 1000;
  log(`${label} took ${secs.toFixed(1)}s`);
  return [out, secs];
}

/** Latest L2 block timestamp, for reporting how far time was warped. */
async function l2Timestamp(node: ReturnType<typeof createAztecNodeClient>): Promise<bigint> {
  const data = await node.getBlockData('latest');
  return BigInt((data as any).header.globalVariables.timestamp);
}

function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/\s+/g, ' ').slice(0, 400);
}

async function main() {
  // Real proving is the whole point of this script; make it explicit and loud.
  const proverEnabled = process.env.E2E_PROVER_ENABLED !== 'false';
  log(`node=${NODE_URL} proverEnabled=${proverEnabled} delay=${DELAY}s`);

  const node = createAztecNodeClient(NODE_URL);
  const nodeDebug = createAztecNodeDebugClient(NODE_URL);
  log(`node info: ${JSON.stringify(await node.getNodeInfo().then((i: any) => ({ v: i.nodeVersion, chain: i.l1ChainId })))}`);

  // The embedded wallet runs its OWN in-process PXE, so proverEnabled here (not any
  // sandbox flag) is what decides whether the client-IVC proof is real.
  const wallet = await EmbeddedWallet.create(NODE_URL, {
    ephemeral: true,
    pxe: { proverEnabled },
  });

  const [admin, oracle, user] = await registerInitialLocalNetworkAccountsInWallet(wallet);
  log(`accounts admin=${admin} oracle=${oracle} user=${user}`);

  // ---- 1. Deploy -----------------------------------------------------------
  const [{ contract: registry }] = await timed('deploy registry', () =>
    ZKPassportRegistryContract.deploy(wallet, admin, oracle, admin).send({ from: admin, wait: WAIT }),
  );
  log(`registry at ${registry.address}`);

  const [{ contract: ageGate }] = await timed('deploy age gate', () =>
    AgeGateContract.deploy(wallet, registry.address).send({ from: admin, wait: WAIT }),
  );
  log(`age gate at ${ageGate.address}`);

  // ---- 2. Seed roots (oracle) and the accepted VK (admin) -------------------
  // valid_from slightly before the proof's current_date so the root is live for it.
  const validFrom = BigInt(FIXTURE.nowTimestamp) - 100n;
  await timed('seed certificate root', () =>
    registry.methods
      .update_root(REGISTRY_CERTIFICATE, Fr.fromHexString(FIXTURE.certificateRegistryRoot), 0n, validFrom)
      .send({ from: oracle, wait: WAIT }),
  );
  await timed('seed circuit root', () =>
    registry.methods
      .update_root(REGISTRY_CIRCUIT, Fr.fromHexString(FIXTURE.circuitRegistryRoot), 0n, validFrom)
      .send({ from: oracle, wait: WAIT }),
  );
  await timed('seed accepted vk', () =>
    registry.methods.add_accepted_vk(Fr.fromHexString(FIXTURE.vkeyHashBB)).send({ from: admin, wait: WAIT }),
  );

  // ---- 3. Advance chain time past the DelayedPublicMutable delay ------------
  //
  // Fixture freshness budget (mirrors the freshness-anchor comment in
  // zkpassport.nr/examples/age_gate_contract/src/test.nr::seed_for_fixture):
  // FIXTURE.nowTimestamp is frozen at fixture-generation time; freshness in
  // zkpassport::verify::verify_zkpassport_proof requires
  //   current_date <= anchor_ts + 3600   AND   current_date + 604800 > anchor_ts
  // (604800s = 7 days, ServiceConfig.validity_period in AgeGate::claim). Every run of this
  // script warps the SANDBOX's L2 clock forward by ~DELAY+120s (~1 day) and that warp is
  // cumulative and persists across script invocations against the same running sandbox instance
  // (only a sandbox restart resets it) -- so anchor_ts drifts ~1 fixture-day closer to the 7-day
  // ceiling on every run. With a 1-day safety margin (matching the README's "~6 days" budget),
  // that leaves roughly ~6 runs (~6 warps) of this script against one sandbox instance before
  // "proof dated in the future"/"proof too old" starts failing here for a reason that has
  // nothing to do with the code under test. Restart the sandbox (or regenerate the fixture via
  // harness/gen-fixtures.sh) to reset the budget.
  const before = await l2Timestamp(node);
  await timed('warp', () => nodeDebug.warpL2TimeAtLeastBy(Number(DELAY + 120n)));
  const after = await l2Timestamp(node);
  log(`L2 timestamp ${before} -> ${after} (+${after - before}s, delay ${DELAY}s)`);
  if (after - before < DELAY) {
    throw new Error(`warp did not clear the ${DELAY}s delay (only +${after - before}s)`);
  }

  // Hard control, not just a log: the DPM value must actually be current post-warp (utility
  // view, no proving involved) or the claim below would fail for a reason unrelated to what
  // this script is testing (registry acceptance vs. real proof verification).
  const vkAccepted = await registry.methods
    .is_vk_accepted(Fr.fromHexString(FIXTURE.vkeyHashBB))
    .simulate({ from: admin });
  const vkAcceptedResult = vkAccepted.result ?? vkAccepted;
  log(`vk accepted after warp: ${JSON.stringify(vkAcceptedResult)}`);
  if (!vkAcceptedResult) {
    throw new Error('vk not accepted after warp — DPM value did not land; aborting before claim');
  }

  // ---- 4. The real claim ---------------------------------------------------
  const blob = [...FIXTURE.vkeyFields, ...FIXTURE.proof, ...FIXTURE.publicInputs].map((h) => Fr.fromHexString(h));
  if (blob.length !== VK_FIELDS + PROOF_FIELDS + FIXTURE.publicInputs.length) {
    throw new Error(`unexpected blob length ${blob.length}`);
  }
  log(`capsule blob: ${blob.length} fields (vk ${VK_FIELDS} + proof ${PROOF_FIELDS} + pi ${FIXTURE.publicInputs.length})`);

  const capsule = (fields: Fr[]) => new Capsule(ageGate.address, PROOF_CAPSULE_SLOT, fields, user as AztecAddress);

  // ---- 4a. Tampered proof must fail — the proving-mode canary --------------
  // Run this FIRST, while the uniqueness nullifier is still unspent: after a
  // successful claim a tampered retry would be rejected for a duplicate nullifier
  // regardless of proving, which would silently mask a proofless run.
  //
  // Flip one bit inside the proof body; vk and public inputs stay valid so every
  // registry/freshness check still passes and ONLY the recursion constraint breaks.
  // Several offsets are probed because different regions of a Honk proof fail
  // differently (a mangled commitment limb dies in point deserialization, a mangled
  // sumcheck/evaluation field survives parsing and dies in the recursive verifier —
  // the latter is the direct evidence that verify_proof_with_type is enforced).
  // All of them must fail; any one succeeding means the recursion was not enforced.
  const offsets = (process.env.E2E_TAMPER_OFFSETS ?? '10,229,457').split(',').map((s) => Number(s.trim()));
  let tamperFailed = true;
  const tamperResults: string[] = [];
  const tamperStart = Date.now();
  for (const offset of offsets) {
    const tampered = [...blob];
    const idx = VK_FIELDS + offset;
    tampered[idx] = new Fr(tampered[idx].toBigInt() ^ 1n);
    log(`tampering proof[${offset}] (blob field ${idx}): ${blob[idx].toString()} -> ${tampered[idx].toString()}`);
    try {
      const { receipt: bad } = await ageGate.methods
        .claim(user)
        .send({ from: user, capsules: [capsule(tampered)], wait: WAIT });
      tamperFailed = false;
      tamperResults.push(`proof[${offset}]: ACCEPTED as ${bad.txHash.toString()} (!!)`);
      log(`  proof[${offset}] was ACCEPTED — the recursion constraint was NOT enforced`);
      break; // a mined bad claim spends the nullifier; nothing after this is meaningful
    } catch (e) {
      tamperResults.push(`proof[${offset}]: rejected — ${describeError(e)}`);
      log(`  proof[${offset}] rejected: ${describeError(e)}`);
    }
  }
  const tamperSecs = (Date.now() - tamperStart) / 1000;
  console.log(`TAMPERED PROOF REJECTED: ${tamperFailed}`);

  if (!tamperFailed) {
    console.log('---');
    console.error(
      'FAILED: a tampered proof was mined. Proving was simulated, not real — the rest of the run is meaningless.',
    );
    await wallet.stop();
    process.exit(1);
  }

  // ---- 4b. The real claim --------------------------------------------------
  const [{ receipt }, claimSecs] = await timed('claim (private tx, client-IVC proving)', () =>
    ageGate.methods.claim(user).send({ from: user, capsules: [capsule(blob)], wait: WAIT }),
  );
  console.log(`CLAIM MINED: ${receipt.txHash.toString()}`);

  // ---- 5. Double claim must collide on the uniqueness nullifier -------------
  let doubleFailed = false;
  let doubleError = '';
  try {
    await ageGate.methods.claim(user).send({ from: user, capsules: [capsule(blob)], wait: WAIT });
  } catch (e) {
    doubleFailed = true;
    doubleError = describeError(e);
  }
  console.log(`DOUBLE CLAIM REJECTED: ${doubleFailed}`);
  if (doubleError) log(`  double-claim error: ${doubleError}`);

  // ---- Evidence summary ----------------------------------------------------
  console.log('---');
  console.log(`proving mode: proverEnabled=${proverEnabled}`);
  console.log(`claim proving+mining: ${claimSecs.toFixed(1)}s`);
  console.log(`tamper probes (${tamperSecs.toFixed(1)}s total):`);
  for (const r of tamperResults) {
    console.log(`  ${r}`);
  }
  console.log(`time strategy: node debug warpL2TimeAtLeastBy(${DELAY + 120n}s), L2 ts ${before} -> ${after}`);

  await wallet.stop();

  if (!doubleFailed) {
    console.error('FAILED: the double claim was not rejected — the uniqueness nullifier did not collide.');
    process.exit(1);
  }
  console.log('OK: all three outcomes as expected.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
