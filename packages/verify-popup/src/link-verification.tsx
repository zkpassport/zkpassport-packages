import { useEffect, useRef, useState } from "react"
import type { ProofResult, QueryBuilderResult, QueryResult } from "@zkpassport/sdk"

import { Notice } from "./layout"
import { VerificationCard, type VerificationConfig } from "./verification-card"

const DASHBOARD_API_URL = (
  import.meta.env.VITE_DASHBOARD_API_URL || "https://dashboard-api.zkpassport.id"
).replace(/\/$/, "")

const UNAVAILABLE_MESSAGE = "The verification service is unavailable. Try again later."

export function LinkVerification({ linkId }: { linkId: string }) {
  const [config, setConfig] = useState<VerificationConfig | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const activeSdkRequest = useRef<QueryBuilderResult | null>(null)

  useEffect(() => {
    fetchLink(linkId).then(setConfig, (error: Error) => setErrorMessage(error.message))
  }, [linkId])

  if (errorMessage) return <Notice>{errorMessage}</Notice>
  if (!config) return <Notice>Loading…</Notice>

  return (
    <VerificationCard
      config={config}
      onRequestCreated={(sdkRequest) => {
        activeSdkRequest.current = sdkRequest
        registerAttempt(linkId, sdkRequest.requestId).catch((error: Error) =>
          setErrorMessage(error.message),
        )
      }}
      onSuccess={({ proofs, result }) => {
        const sdkRequest = activeSdkRequest.current!
        return submitResult(linkId, {
          requestId: sdkRequest.requestId,
          sdkVersion: new URL(sdkRequest.url).searchParams.get("v") ?? "",
          proofs,
          queryResult: result,
        })
      }}
    />
  )
}

async function fetchLink(linkId: string): Promise<VerificationConfig> {
  const response = await dashboardFetch(linkPath(linkId))
  const body = (await response.json()) as { link: VerificationConfig }
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
