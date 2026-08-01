/**
 * INTERNAL — browser enrollment (saved IDs) and browser proving.
 *
 * This API only functions on ZKPassport's hosted verify origin, where saved
 * enrollments live (passkey-gated, IndexedDB-backed, origin-scoped). It is
 * consumed by the ZKPassport UI card and the hosted verification popup; it is
 * not part of the public SDK surface and may change without notice. Relying
 * parties never need it: on any other origin the store is empty by construction.
 */

export {
  createEnrollment,
  deleteEnrollment,
  getEnrollmentId,
  getMaskedName,
  isEnrollmentStorageSupported,
  listEnrollments,
  unlockEnrollment,
  type EnrollmentMeta,
  type EnrollmentRecord,
  type EnrollmentStoreEnvironment,
} from "./store"

export {
  EnrollmentStaleError,
  UnsupportedQueryError,
  isQueryLocallyProvable,
  proveLocally,
  type LocalProofProgress,
} from "./browser-prover"

export { warmupLocalProving } from "./prover-cache"
