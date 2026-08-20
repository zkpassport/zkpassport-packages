/**
 * The compiled ZKPassportRegistry artifact, loaded from the Noir workspace's
 * (gitignored) `target/` output — compile `zkpassport.nr` first, same as the
 * e2e package's generated bindings.
 *
 * COUPLING: this is whatever build sits in `target/`. `INITIAL_DELAY` is a
 * compile-time constant, so a preview-delay build is a DIFFERENT contract class
 * than the production 24h one; registering an artifact whose class does not
 * match the on-chain registry instance leaves the PXE unable to execute the
 * verifier's `.view()` ("No artifact registered for contract class …").
 * `registerZKPassportRegistry` checks the class id up front so a mismatch fails
 * with an actionable error instead.
 */
import {
  type ContractArtifact,
  loadContractArtifact,
  type NoirCompiledContract,
} from "@aztec/aztec.js/abi"
import ZKPassportRegistryJson from "../../zkpassport.nr/target/zkpassport_registry_contract-ZKPassportRegistry.json" with { type: "json" }

export const ZKPassportRegistryArtifact: ContractArtifact = loadContractArtifact(
  ZKPassportRegistryJson as NoirCompiledContract,
)
