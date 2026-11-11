/**
 * Write the request body the OPRF nodes send to the proof verifier's /verify-oprf-auth route, for a
 * ZKR mock passport proved against the testnet registries:
 *
 *   bun scripts/oprf-verify-request.ts <output.json>
 *
 * The facematch proof uses an attestation the production iOS app made for a passport with the mock
 * passports' DG2 hash. CIRCUIT_VERSION sets the circuit version, 0.22.0 by default, and
 * SEPOLIA_RPC_URL the RPC.
 */
import { writeFile } from "node:fs/promises"
import { createRegistryClient } from "@zkpassport/registry"
import { createMockPassport } from "@zkpassport/utils/mock-passports"
import attestation from "../fixtures/ios-facematch-attestation.json"
import { proveOprfAuthProofs } from "../src/prove"

const outputPath = process.argv[2]
if (!outputPath) {
  throw new Error("Usage: bun scripts/oprf-verify-request.ts <output.json>")
}

const { proofs, blindedUniqueIdentifier } = await proveOprfAuthProofs({
  passport: createMockPassport(),
  attestation,
  domain: "localhost",
  circuitVersion: process.env.CIRCUIT_VERSION || "0.22.0",
  registry: createRegistryClient("ethereum_sepolia", { rpcUrl: process.env.SEPOLIA_RPC_URL }),
})

const request = { blinded_unique_identifier: blindedUniqueIdentifier, proofs }
await writeFile(outputPath, JSON.stringify(request, null, 2) + "\n")
console.log(`Wrote ${proofs.length} proofs to ${outputPath}`)
