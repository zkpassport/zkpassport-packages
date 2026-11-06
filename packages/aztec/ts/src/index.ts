export { ZKPassportRegistryArtifact } from "./artifact.ts"
export { assembleDiscloseCapsule, assembleProofCapsule, type OuterProofParts } from "./capsule.ts"
export {
  DISCLOSE_CAPSULE_SLOT,
  MRZ_LENGTH,
  outerCapsuleLength,
  outerPublicInputCount,
  PROOF_CAPSULE_SLOT,
  PROOF_FIELDS,
  SANCTIONS_CAPSULE_SLOT,
  VK_FIELDS,
} from "./constants.ts"
export {
  isIdCard,
  nationalityBytes,
  packNationality,
  TD1_NATIONALITY_INDEX,
  TD3_NATIONALITY_INDEX,
} from "./disclosed-data.ts"
export { registerZKPassportRegistry, type RegistryNode, type RegistryWallet } from "./register.ts"
export { fetchOuterVk } from "./vk.ts"
