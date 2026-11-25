/** What the dashboard publishes about the project registered for a domain. */
export type PublicProject = {
  domain: string
  domainVerified: boolean
  allowedOrigins: string[]
}

/** Looks up the project registered for a host. Resolves to null when there is none, and throws when the lookup fails. */
export type ProjectLookup = (domainHost: string) => Promise<PublicProject | null>

export type DomainTrustVerifiedReason =
  | "same-host"
  | "www-alias"
  | "localhost"
  | "trusted-origin"
  | "subdomain"
  | "parent-domain"
  | "allowed-origin"

export type DomainTrustUnverifiedReason = "no-origin" | "non-browser"

export type DomainTrustBlockedReason = "lookup-failed" | "no-project" | "origin-not-allowed"

/**
 * Whether a page may make a request in the name of a domain.
 * - `verified`: the origin is the domain's own site, or the domain's verified project allows it.
 * - `unverified`: there is no page origin to check, so nothing contradicts the domain.
 * - `blocked`: the origin is a different site that the domain has not been shown to allow.
 */
export type DomainTrust = { originHost: string; domainHost: string } & (
  | { status: "verified"; reason: DomainTrustVerifiedReason }
  | { status: "unverified"; reason: DomainTrustUnverifiedReason }
  | { status: "blocked"; reason: DomainTrustBlockedReason }
)

const LOCALHOST_ORIGINS = new Set(["localhost", "127.0.0.1"])

const NON_BROWSER_ORIGINS = new Set(["nodejs", "undefined", "null"])

// What the bridge reports when the first connection to a request sent no Origin header
const BRIDGE_ORIGIN_PLACEHOLDER = "none"

// Domains that hand out subdomains to unrelated parties: a subdomain of one is not the same site
const SHARED_HOSTING_DOMAINS = [
  "vercel.app",
  "netlify.app",
  "pages.dev",
  "workers.dev",
  "deno.dev",
  "github.io",
  "gitlab.io",
  "web.app",
  "firebaseapp.com",
  "appspot.com",
  "run.app",
  "herokuapp.com",
  "onrender.com",
  "fly.dev",
  "railway.app",
  "azurewebsites.net",
  "amplifyapp.com",
  "cloudfront.net",
  "amazonaws.com",
  "replit.app",
  "replit.dev",
  "glitch.me",
  "surge.sh",
  "lovable.app",
  "framer.app",
  "framer.website",
  "webflow.io",
  "myshopify.com",
  "wixsite.com",
  "squarespace.com",
  "wordpress.com",
  "blogspot.com",
  "substack.com",
  "notion.site",
  "carrd.co",
  "ngrok.io",
  "ngrok.app",
  "ngrok-free.app",
  "ngrok-free.dev",
  "trycloudflare.com",
  "loca.lt",
  "sslip.io",
  "nip.io",
]

/** Reduces a domain, origin or URL to its lowercase host, without scheme, port, path, query or hash. */
export function normalizeHostname(value: string | undefined): string {
  if (!value) return ""
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]
    .split(":")[0]
}

const withoutWww = (host: string) => host.replace(/^www\./, "")

const isWithin = (host: string, parent: string) => host === parent || host.endsWith(`.${parent}`)

function isSubdomainOfOwnSite(host: string, parent: string): boolean {
  if (!parent.includes(".") || !host.endsWith(`.${parent}`)) return false
  return !SHARED_HOSTING_DOMAINS.some((shared) => isWithin(parent, shared))
}

/**
 * Checks whether the page at `origin` may make a request in the name of `domain`.
 *
 * The dashboard is only asked when the origin is a different site from the domain, so every
 * other case is decided without it.
 * @param origin The origin of the page making the request, as observed rather than as claimed.
 * @param domain The domain the request names.
 * @param lookupProject Looks up the dashboard project for the domain.
 * @param trustedOrigins Hosts that check the domain themselves and are trusted for any domain.
 */
export async function checkDomainTrust({
  origin,
  domain,
  lookupProject,
  trustedOrigins = [],
}: {
  origin: string | undefined
  domain: string
  lookupProject: ProjectLookup
  trustedOrigins?: string[]
}): Promise<DomainTrust> {
  const originHost = normalizeHostname(origin)
  const domainHost = normalizeHostname(domain)
  const verified = (reason: DomainTrustVerifiedReason): DomainTrust => ({
    status: "verified",
    reason,
    originHost,
    domainHost,
  })
  const unverified = (reason: DomainTrustUnverifiedReason): DomainTrust => ({
    status: "unverified",
    reason,
    originHost,
    domainHost,
  })
  const blocked = (reason: DomainTrustBlockedReason): DomainTrust => ({
    status: "blocked",
    reason,
    originHost,
    domainHost,
  })

  if (!originHost || originHost === BRIDGE_ORIGIN_PLACEHOLDER) return unverified("no-origin")
  if (NON_BROWSER_ORIGINS.has(originHost)) return unverified("non-browser")

  if (originHost === domainHost) return verified("same-host")
  if (withoutWww(originHost) === withoutWww(domainHost)) return verified("www-alias")
  if (LOCALHOST_ORIGINS.has(originHost)) return verified("localhost")
  if (trustedOrigins.some((trusted) => normalizeHostname(trusted) === originHost)) {
    return verified("trusted-origin")
  }
  if (isSubdomainOfOwnSite(originHost, domainHost)) return verified("subdomain")
  if (isSubdomainOfOwnSite(domainHost, originHost)) return verified("parent-domain")

  let project: PublicProject | null
  try {
    project = await lookupProject(domainHost)
  } catch {
    return blocked("lookup-failed")
  }

  // Only a project that has proven ownership of the domain may vouch for other origins;
  // otherwise anyone could register the domain unverified and list their own origin
  if (!project || normalizeHostname(project.domain) !== domainHost || !project.domainVerified) {
    return blocked("no-project")
  }

  const allowed = project.allowedOrigins.some(
    (allowedOrigin) => normalizeHostname(allowedOrigin) === originHost,
  )
  return allowed ? verified("allowed-origin") : blocked("origin-not-allowed")
}

/**
 * Creates a {@link ProjectLookup} that reads the dashboard's public project endpoint.
 * @param apiUrl The dashboard API base URL.
 * @param fetch The fetch implementation to use, the global one by default.
 * @param timeoutMs How long to wait for the dashboard before the lookup fails.
 */
export function createProjectLookup({
  apiUrl,
  fetch: fetchImpl,
  timeoutMs = 8000,
}: {
  apiUrl: string
  fetch?: typeof fetch
  timeoutMs?: number
}): ProjectLookup {
  return async (domainHost) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await (fetchImpl ?? fetch)(
        `${apiUrl.replace(/\/$/, "")}/public/project?domain=${encodeURIComponent(domainHost)}`,
        { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal },
      )
      if (!response.ok) throw new Error(`Project lookup failed with status ${response.status}`)
      const body = (await response.json()) as { project?: PublicProject | null }
      return body?.project ?? null
    } finally {
      clearTimeout(timeout)
    }
  }
}
