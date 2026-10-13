import type { QueryBuilderResult, RequestSuccess } from "@zkpassport/sdk"
import type { Query } from "@zkpassport/utils"

export type RequestEvent =
  | { type: "requestReceived" }
  | { type: "generatingProof" }
  | { type: "proofGenerated"; name?: string }
  | { type: "success"; response: RequestSuccess }

export type TrackedRequest = { url: string; query: Query; events: RequestEvent[] }

/**
 * Record a request's SDK callbacks as events. The outcome resolves when the SDK reports success and
 * rejects when it reports a reject or an error.
 */
export function trackRequest(request: QueryBuilderResult): {
  trackedRequest: TrackedRequest
  outcome: Promise<void>
} {
  const events: RequestEvent[] = []
  const outcome = new Promise<void>((resolve, reject) => {
    request.onRequestReceived(() => events.push({ type: "requestReceived" }))
    request.onGeneratingProof(() => events.push({ type: "generatingProof" }))
    request.onProofGenerated((proof) => events.push({ type: "proofGenerated", name: proof.name }))
    request.onSuccess((response) => {
      events.push({ type: "success", response })
      resolve()
    })
    request.onReject(() => reject(new Error("onReject")))
    request.onError((error) => reject(new Error(`onError: ${error}`)))
  })
  return { trackedRequest: { url: request.url, query: request.query, events }, outcome }
}
