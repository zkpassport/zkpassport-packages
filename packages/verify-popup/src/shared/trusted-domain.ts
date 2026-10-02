export const DASHBOARD_API_URL = (
  import.meta.env.VITE_DASHBOARD_API_URL || "https://dashboard-api.zkpassport.id"
).replace(/\/$/, "")

const LOOKUP_TIMEOUT_MS = 8000

const LOCALHOST = new Set(["localhost", "127.0.0.1"])

type PublicProject = {
  domain: string
  domainVerified: boolean
  allowedOrigins: string[]
}

export function normalizeHostname(value: string | undefined): string {
  if (!value) return ""
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split("/")[0]
    .split(":")[0]
}

async function fetchPublicProject(
  domain: string,
  fetchImpl: typeof fetch,
  apiUrl: string,
): Promise<PublicProject | null> {
  const response = await fetchImpl(
    `${apiUrl}/public/project?domain=${encodeURIComponent(domain)}`,
    { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) },
  )
  if (!response.ok) return null
  const body = (await response.json()) as { project?: PublicProject | null }
  return body?.project ?? null
}

export async function resolveTrustedDomain(
  claimed: string | undefined,
  rpHost: string,
  deps: { fetch?: typeof fetch; apiUrl?: string } = {},
): Promise<string> {
  const originHost = normalizeHostname(rpHost)
  const domainHost = normalizeHostname(claimed)
  if (!domainHost || domainHost === originHost) return originHost
  if (LOCALHOST.has(originHost)) return domainHost

  const refused = () =>
    new Error(
      `${originHost} is not an allowed origin for ${domainHost}. Add it under allowed origins ` +
        `for ${domainHost} at https://dashboard.zkpassport.id, or remove the domain override.`,
    )

  let project: PublicProject | null
  try {
    project = await fetchPublicProject(
      domainHost,
      deps.fetch ?? fetch,
      deps.apiUrl ?? DASHBOARD_API_URL,
    )
  } catch (reason) {
    const detail = reason instanceof Error ? reason.message : String(reason)
    throw new Error(`Could not confirm that ${originHost} may verify as ${domainHost}: ${detail}`)
  }
  if (!project) throw refused()
  if (normalizeHostname(project.domain) !== domainHost) throw refused()
  // An unverified project could be registered by anyone and list any origin
  if (!project.domainVerified) throw refused()
  const allowed = project.allowedOrigins.some((origin) => normalizeHostname(origin) === originHost)
  if (!allowed) throw refused()
  return domainHost
}
