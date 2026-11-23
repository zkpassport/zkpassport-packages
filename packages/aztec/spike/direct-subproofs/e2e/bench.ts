// Proves one bench function's transaction with the PXE (Chonk), once cold and then warm, and
// appends the timings and the peak RSS of this process tree to results.jsonl.
//
// Usage: tsx bench.ts <native|wasm|wasm-1g> <bench_fn> <warm runs>
import { AztecClientBackend, BackendType, Barretenberg } from "@aztec-foundation/bb.js"
import { serializeWitness } from "@aztec-foundation/noir-noirc_abi"
import { BBBundlePrivateKernelProver } from "@aztec-labs/bb-prover/client/bundle"
import { WASMSimulator } from "@aztec-labs/simulator/client"
import type { PrivateExecutionStep } from "@aztec-labs/stdlib/kernel"
import { ChonkProofWithPublicInputs } from "@aztec-labs/stdlib/proofs"
import { ungzip } from "pako"
import { Contract } from "@aztec-labs/aztec.js/contracts"
import { createAztecNodeClient } from "@aztec-labs/aztec.js/node"
import { EmbeddedWallet } from "@aztec-labs/wallets/embedded"
import { registerInitialLocalNetworkAccountsInWallet } from "@aztec-labs/wallets/testing"
import { exec } from "child_process"
import { appendFileSync } from "fs"
import { cpus } from "os"

import { ARTIFACTS, type Bench, benchInputs, NODE_URL, readDeployment } from "./common.ts"

const [backendName, fn, warmArg] = process.argv.slice(2) as [string, Bench, string]
const warm = Number(warmArg ?? 3)

// 2^14 pages = 1 GiB: bb.js's own cap for iOS browsers. 4 threads stands in for a phone.
const BACKENDS: Record<string, object> = {
  native: { backend: BackendType.NativeUnixSocket },
  wasm: { backend: BackendType.WasmWorker, threads: cpus().length },
  "wasm-1g": { backend: BackendType.WasmWorker, threads: 4, memory: { maximum: 2 ** 14 } },
  // A cap of MAX_PAGES 64 KiB pages, to find the smallest that proves (and check the cap holds)
  "wasm-cap": { backend: BackendType.WasmWorker, threads: 4, memory: { maximum: Number(process.env.MAX_PAGES) } },
}
if (!BACKENDS[backendName]) throw new Error(`backend must be one of ${Object.keys(BACKENDS)}`)

// The PXE's prover proves on the bb.js singleton, which in Node @aztec-labs/foundation's poseidon2
// creates first, with default (native) options. This prover proves on its own instance of the
// backend under test instead, with the PXE prover's createChonkProof otherwise unchanged, so
// hashing and witness generation stay as they are.
class DedicatedBackendProver extends BBBundlePrivateKernelProver {
  bb?: Barretenberg
  constructor(private bbOptions: object) {
    super(new WASMSimulator(), {})
  }
  override async createChonkProof(steps: PrivateExecutionStep[]) {
    this.bb ??= await Barretenberg.new(this.bbOptions)
    backendClass = (this.bb as any).backend?.constructor?.name
    const backend = new AztecClientBackend(
      steps.map((s) => ungzip(s.bytecode)),
      this.bb,
      steps.map((s) => s.functionName),
      steps.map((s) => s.kind),
    )
    const result = await backend.prove(
      steps.map((s) => ungzip(serializeWitness(s.witness))),
      steps.map((s) => s.vk),
      { compress: true },
    )
    const proof = ChonkProofWithPublicInputs.fromBufferArray(result.proofFields)
    proof.compressedProof = result.compressedProof ? Buffer.from(result.compressedProof) : undefined
    return proof
  }
}
let backendClass: string | undefined

// Peak RSS of this process and its descendants (the native backend proves in a bb child)
let peakKb = 0
function sampleTree(): Promise<void> {
  return new Promise((resolve) =>
    exec("ps -A -o pid=,ppid=,rss=", (_err, out) => {
      const rows = out.trim().split("\n").map((l) => l.trim().split(/\s+/).map(Number))
      const tree = new Set([process.pid])
      for (let grew = true; grew; ) {
        grew = false
        for (const [pid, ppid] of rows) if (tree.has(ppid) && !tree.has(pid)) (tree.add(pid), (grew = true))
      }
      const kb = rows.filter(([pid]) => tree.has(pid)).reduce((n, [, , rss]) => n + rss, 0)
      peakKb = Math.max(peakKb, kb)
      resolve()
    }),
  )
}
let sampling = false
async function sampler() {
  while (sampling) {
    await sampleTree()
    await new Promise((r) => setTimeout(r, 100))
  }
}

const node = createAztecNodeClient(NODE_URL)
const wallet = await EmbeddedWallet.create(node, {
  ephemeral: true,
  pxe: { proverEnabled: true, proverOrOptions: new DedicatedBackendProver(BACKENDS[backendName]) },
})
const [from] = await registerInitialLocalNetworkAccountsInWallet(wallet)
const deployment = readDeployment()
for (const name of Object.keys(ARTIFACTS) as (keyof typeof ARTIFACTS)[]) {
  await wallet.registerContract((await node.getContract(deployment[name]))!, ARTIFACTS[name])
}
const contract = Contract.at(deployment.test, ARTIFACTS.test, wallet)
const { args, capsules, fields } = benchInputs(fn, deployment, from)

for (let run = 0; run <= warm; run++) {
  peakKb = 0
  sampling = true
  const done = sampler()
  const t0 = performance.now()
  let ok = true
  let error: string | undefined
  let timings: any
  try {
    const result = await contract.methods[fn](...args).profile({
      from,
      capsules,
      profileMode: "execution-steps",
      skipProofGeneration: false,
    })
    timings = result.stats.timings
  } catch (e) {
    ok = false
    error = String((e as Error).message ?? e).slice(0, 300)
  }
  const wallMs = performance.now() - t0
  sampling = false
  await done
  const row = {
    backend: backendName,
    backendClass,
    fn,
    run,
    phase: run === 0 ? "cold" : "warm",
    ok,
    error,
    capsuleFields: fields,
    provingMs: timings?.proving,
    witgenMs: timings?.perFunction?.reduce((n: number, f: { time: number }) => n + f.time, 0),
    totalMs: timings?.total,
    wallMs: Math.round(wallMs),
    peakRssMb: Math.round(peakKb / 1024),
    functions: timings?.perFunction?.map((f: { functionName: string }) => f.functionName),
  }
  console.log(JSON.stringify(row))
  appendFileSync(new URL("./results.jsonl", import.meta.url), JSON.stringify(row) + "\n")
  if (!ok) break
}
process.exit(0)
