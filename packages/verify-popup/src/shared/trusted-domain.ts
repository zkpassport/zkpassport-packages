import { checkDomainTrust, createProjectLookup, normalizeHostname } from "@zkpassport/utils"

export const DASHBOARD_API_URL = (
  import.meta.env.VITE_DASHBOARD_API_URL || "https://dashboard-api.zkpassport.id"
).replace(/\/$/, "")

export async function resolveTrustedDomain(
  claimed: string | undefined,
  rpHost: string,
  deps: { fetch?: typeof fetch; apiUrl?: string } = {},
): Promise<string> {
  const originHost = normalizeHostname(rpHost)
  if (!normalizeHostname(claimed)) return originHost

  const trust = await checkDomainTrust({
    origin: rpHost,
    domain: claimed!,
    lookupProject: createProjectLookup({
      apiUrl: deps.apiUrl ?? DASHBOARD_API_URL,
      fetch: deps.fetch,
    }),
  })
  const { domainHost } = trust
  if (trust.status === "verified") return domainHost

  if (trust.reason === "lookup-failed") {
    throw new Error(
      `Could not confirm that ${originHost} may verify as ${domainHost}. Please try again.`,
    )
  }
  // The phone trusts this page for any domain, so a request it cannot tie to a page is refused
  if (trust.status === "unverified") {
    throw new Error(`Could not tell which website is asking to verify as ${domainHost}.`)
  }
  throw new Error(
    `${originHost} is not an allowed origin for ${domainHost}. Add it under allowed origins ` +
      `for ${domainHost} at https://dashboard.zkpassport.id, or remove the domain override.`,
  )
}
