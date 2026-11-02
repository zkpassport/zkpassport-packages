import { useEffect, useRef, useState } from "react"
import type { ProofResult, Query, QueryBuilderResult, QueryResult } from "@zkpassport/sdk"
import type { PopupRequestConfig } from "@zkpassport/sdk/popup"

import { Notice } from "../shared/frame"
import { DASHBOARD_API_URL } from "../shared/trusted-domain"
import type { Session } from "../session"
import { VerifyRequest } from "../verify"

export type VerificationLink = {
  domain: string
  request: PopupRequestConfig
  query: Query
}

const UNAVAILABLE_MESSAGE = "The verification service is unavailable. Try again later."

export function LinkVerification({ linkId, session }: { linkId: string; session: Session }) {
  const [link, setLink] = useState<VerificationLink | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const activeRequest = useRef<QueryBuilderResult | null>(null)

  useEffect(() => {
    fetchLink(linkId).then(setLink, (error: Error) => setErrorMessage(error.message))
  }, [linkId])

  if (errorMessage) return <Notice>{errorMessage}</Notice>
  if (!link) return <Notice>Loading…</Notice>

  const appName = link.request.name || link.domain
  return (
    <VerifyRequest
      domain={link.domain}
      request={link.request}
      query={link.query}
      appName={appName}
      logo={link.request.logo}
      session={session}
      onRequestCreated={(created, { resumed }) => {
        activeRequest.current = created
        // A resumed request keeps its id, so the dashboard already has its attempt
        if (resumed) return
        return registerAttempt(linkId, created.requestId)
      }}
      send={(message) => {
        if (message.type !== "success") return
        const created = activeRequest.current!
        return submitResult(linkId, {
          requestId: created.requestId,
          sdkVersion: new URL(created.url).searchParams.get("v") ?? "",
          proofs: message.proofs,
          queryResult: message.result,
        })
      }}
    />
  )
}

async function fetchLink(linkId: string): Promise<VerificationLink> {
  const response = await dashboardFetch(linkPath(linkId))
  const body = (await response.json()) as { link: VerificationLink }
  return body.link
}

async function registerAttempt(linkId: string, requestId: string): Promise<void> {
  await dashboardFetch(`${linkPath(linkId)}/attempts`, postJson({ requestId }))
}

async function submitResult(
  linkId: string,
  result: {
    requestId: string
    sdkVersion: string
    proofs: ProofResult[]
    queryResult: QueryResult
  },
): Promise<void> {
  await dashboardFetch(`${linkPath(linkId)}/results`, postJson(result))
}

function linkPath(linkId: string): string {
  return `/public/verification-links/${encodeURIComponent(linkId)}`
}

function postJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }
}

async function dashboardFetch(path: string, init?: RequestInit): Promise<Response> {
  let response: Response
  try {
    response = await fetch(DASHBOARD_API_URL + path, init)
  } catch {
    throw new Error(UNAVAILABLE_MESSAGE)
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? UNAVAILABLE_MESSAGE)
  }
  return response
}
