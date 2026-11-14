/**
 * The public inputs that close a proof, read by name rather than by an offset from the end, as
 * the contracts read them (PublicInput.*_OFFSET_FROM_END): a layout that grows then changes one
 * list here, not every reader.
 */

/** An outer proof's public inputs after its param commitments, in order */
const OUTER_TRAILING = [
  "nullifier_type",
  "scoped_nullifier",
  "oprf_pk_hash",
  // Since circuit version 0.23.0
  "verification_method",
] as const

/** An attested ID (Tier 2 base) proof's last outputs, in order */
const ATTESTED_ID_TRAILING = ["param_commitment", "verification_method"] as const

export type OuterTrailingInput = (typeof OUTER_TRAILING)[number]
export type AttestedIdTrailingOutput = (typeof ATTESTED_ID_TRAILING)[number]

/** The outer proof's trailing inputs, for a layout with or without the verification method */
export function outerTrailingInputs(
  withVerificationMethod: boolean,
): readonly OuterTrailingInput[] {
  return withVerificationMethod ? OUTER_TRAILING : OUTER_TRAILING.slice(0, 3)
}

function trailing<T extends string>(
  publicInputs: readonly string[],
  layout: readonly T[],
  name: T,
): string {
  const position = layout.indexOf(name)
  if (position < 0) throw new Error(`This proof's public inputs have no ${name}`)
  const index = publicInputs.length - layout.length + position
  if (index < 0) throw new Error(`Too few public inputs to hold ${name}`)
  return publicInputs[index]
}

/** One of an outer proof's trailing public inputs */
export function getOuterTrailingInput(
  publicInputs: readonly string[],
  name: OuterTrailingInput,
  withVerificationMethod: boolean,
): string {
  return trailing(publicInputs, outerTrailingInputs(withVerificationMethod), name)
}

/** Where an outer proof's param commitments end: the index of its first trailing input */
export function outerTrailingStart(
  publicInputs: readonly string[],
  withVerificationMethod: boolean,
): number {
  return publicInputs.length - outerTrailingInputs(withVerificationMethod).length
}

/** One of an attested ID proof's last outputs */
export function getAttestedIdTrailingOutput(
  publicInputs: readonly string[],
  name: AttestedIdTrailingOutput,
): string {
  return trailing(publicInputs, ATTESTED_ID_TRAILING, name)
}
