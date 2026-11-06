/**
 * The compiled ZKPassportRegistry artifact.
 */
import {
  type ContractArtifact,
  loadContractArtifact,
  type NoirCompiledContract,
} from "@aztec-labs/aztec.js/abi"
import ZKPassportRegistryJson from "../../noir/target/zkpassport_registry_contract-ZKPassportRegistry.json" with { type: "json" }

export const ZKPassportRegistryArtifact: ContractArtifact = loadContractArtifact(
  ZKPassportRegistryJson as NoirCompiledContract,
)
