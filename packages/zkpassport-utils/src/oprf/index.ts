export { evaluateOPRF, getOprfPublicKey, hashOprfPublicKey } from "./client"
export { generateOPRFKeypair } from "./mock"
export {
  computeAuthCommitment,
  randomAuthSecret,
  getRegistrationId,
  registrationIdToWire,
  registerAuthCommitment,
  rotateAuthCommitment,
  OPRFNodeCallError,
} from "./registration"
export type { OPRFNodeCallResult, OPRFNodeCallErrorCode } from "./registration"
export type {
  OPRFEvaluatorOptions as OPRFOptions,
  OPRFEvaluatorAuth,
  OPRFFaceMatchAuth,
  OPRFRegisterAuth,
  OPRFNullifierAuth,
  OPRFResult,
  OPRFProof,
  OPRFPublicKey,
  BabyJubJubPoint,
} from "./types"
export {
  OPRF_ZERO_PROOF,
  OPRF_DEFAULT_KEY_ID,
  DEFAULT_OPRF_PUB_KEY,
  DEFAULT_OPRF_PUB_KEY_HASH,
  OPRF_REGISTER_MODULE,
  OPRF_NULLIFIER_MODULE,
  OPRF_AUTH_COMMITMENT_DOMAIN_SEPARATOR,
} from "./constants"
export { randomBlindingFactor } from "@taceo/oprf-core"
