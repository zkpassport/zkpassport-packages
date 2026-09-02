/**
 * Checks an HTTP Basic Authorization header against configured credentials.
 *
 * @param authorizationHeader The request's Authorization header, or null.
 * @param credentials Expected "user:pass" pair; when unset or empty the gate
 *   is disabled and every request is allowed.
 */
export function checkBasicAuth(
  authorizationHeader: string | null,
  credentials: string | undefined,
): boolean {
  if (!credentials) {
    return true
  }
  if (!authorizationHeader) {
    return false
  }
  const [scheme, token, ...rest] = authorizationHeader.split(" ")
  if (!scheme || !token || rest.length > 0 || scheme.toLowerCase() !== "basic") {
    return false
  }
  return token === btoa(credentials)
}
