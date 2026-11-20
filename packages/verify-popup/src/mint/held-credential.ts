import type { CredentialsClient } from "@zkpassport/onchain-credentials"

/**
 * Until when the recipient already holds the credential, or null when the flow should prove and
 * mint: the recipient holds none, or is renewing it.
 */
export async function heldCredentialUntil(
  credentials: Pick<CredentialsClient, "hasCredential" | "heldUntil">,
  recipient: `0x${string}`,
  policyId: bigint,
  renew = false,
): Promise<bigint | null> {
  if (renew || !(await credentials.hasCredential(recipient, policyId))) return null
  return credentials.heldUntil(recipient, policyId)
}
