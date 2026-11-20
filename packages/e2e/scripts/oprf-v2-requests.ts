/**
 * Write the request bodies the OPRF nodes send to the proof verifier's OPRF v2 routes, one file per
 * step, for a ZKR mock passport proved against the testnet registries:
 *
 *   OPRF_REGISTRATION_CIRCUITS_DIR=<dir> bun scripts/oprf-v2-requests.ts <output dir>
 *
 * OPRF_REGISTRATION_CIRCUITS_DIR is a packaged circuits directory holding oprf_registration, which
 * is not on the testnet CDN yet. The registration key is a fixed mock key, so the verifier must run
 * with the OPRF_REGISTRATION_PUBLIC_KEY written to meta.json, and with ?devmode=true for the mock
 * passport. CIRCUIT_VERSION sets the version of the other circuits, 0.23.0 by default, and
 * SEPOLIA_RPC_URL the RPC.
 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { createRegistryClient } from "@zkpassport/registry"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import attestation from "../fixtures/ios-facematch-attestation.json"
import { loadPackagedCircuits } from "../src/packaged-circuits"
import { proveOprfAuthProofs, proveOprfRegistrationProofs } from "../src/prove"

// Test-only values, fixed so every run agrees on the key and the commitments
const REGISTRATION_KEY = 0x0123456789abcdef0123456789abcdef0123456789abcdefn
const AUTH_SECRET = 0x5ec2e7n
const ROTATED_AUTH_SECRET = 0x5ec2e7_2n

const outputDir = process.argv[2]
const circuitsDir = process.env.OPRF_REGISTRATION_CIRCUITS_DIR
if (!outputDir || !circuitsDir) {
  throw new Error(
    "Usage: OPRF_REGISTRATION_CIRCUITS_DIR=<dir> bun scripts/oprf-v2-requests.ts <output dir>",
  )
}

const packaged = loadPackagedCircuits(circuitsDir)
const registrationCircuit = packaged.circuits.find((c) => c.name === "oprf_registration")
if (!registrationCircuit) throw new Error(`No oprf_registration circuit in ${circuitsDir}`)

const passport = createMockPassport()
const circuitVersion = process.env.CIRCUIT_VERSION || "0.23.0"

const { proofs, blindedUniqueIdentifier } = await proveOprfAuthProofs({
  passport,
  attestation,
  domain: "localhost",
  circuitVersion,
  registry: createRegistryClient("ethereum_sepolia", { rpcUrl: process.env.SEPOLIA_RPC_URL }),
})
const base = proofs.filter(
  (p) => !p.name?.startsWith("facematch") && !p.name?.startsWith("oprf_auth"),
)
const facematch = proofs.find((p) => p.name?.startsWith("facematch"))!
const oprfAuth = proofs.find((p) => p.name?.startsWith("oprf_auth"))!

const {
  registrationId,
  registrationPublicKey,
  registrations: [registered, rotated],
} = await proveOprfRegistrationProofs({
  passport,
  registrationKey: REGISTRATION_KEY,
  authSecrets: [AUTH_SECRET, ROTATED_AUTH_SECRET],
  circuit: registrationCircuit,
  version: packaged.manifest.version,
})

const I = [registrationId.x.toString(), registrationId.y.toString()]
const requests = {
  identify: { proofs: [...base, oprfAuth], blinded_query: blindedUniqueIdentifier },
  register: {
    proofs: [...base, registered.proof],
    I,
    commitment: registered.authCommitment.toString(),
  },
  query: {
    proofs: [...base, oprfAuth, registered.proof],
    blinded_query: blindedUniqueIdentifier,
    I,
    commitment: registered.authCommitment.toString(),
  },
  rotate: {
    proofs: [...base, facematch, rotated.proof],
    I,
    commitment: rotated.authCommitment.toString(),
  },
}
const meta = {
  OPRF_REGISTRATION_PUBLIC_KEY: `${registrationPublicKey.x},${registrationPublicKey.y}`,
  circuitVersion,
  oprfRegistrationVersion: packaged.manifest.version,
  oprfRegistrationRoot: packaged.manifest.root,
  generatedAt: new Date().toISOString(),
}

await mkdir(outputDir, { recursive: true })
for (const [step, body] of Object.entries(requests)) {
  await writeFile(join(outputDir, `${step}.json`), JSON.stringify(body, null, 2) + "\n")
}
await writeFile(join(outputDir, "meta.json"), JSON.stringify(meta, null, 2) + "\n")
console.log(`Wrote identify, register, query and rotate requests to ${outputDir}`)
console.log(`OPRF_REGISTRATION_PUBLIC_KEY=${meta.OPRF_REGISTRATION_PUBLIC_KEY}`)
