import type { QueryBuilderResult, RequestSuccess } from "@zkpassport/sdk"
import type { Query } from "@zkpassport/utils"

export type RequestEvent =
  | { type: "requestReceived" }
  | { type: "generatingProof" }
  | { type: "proofGenerated"; name?: string }
  | { type: "success" }

export type TrackedRequest = {
  url: string
  query: Query
  events: RequestEvent[]
  success: Promise<RequestSuccess>
}

/** Record a request's SDK callbacks as events, and its success or failure as a promise */
export function trackRequest(request: QueryBuilderResult): TrackedRequest {
  const events: RequestEvent[] = []
  const success = new Promise<RequestSuccess>((resolve, reject) => {
    request.onRequestReceived(() => events.push({ type: "requestReceived" }))
    request.onGeneratingProof(() => events.push({ type: "generatingProof" }))
    request.onProofGenerated((proof) => events.push({ type: "proofGenerated", name: proof.name }))
    request.onSuccess((response) => {
      events.push({ type: "success" })
      resolve(response)
    })
    request.onReject(() => reject(new Error("onReject")))
    request.onError((error) => reject(new Error(`onError: ${error}`)))
  })
  return { url: request.url, query: request.query, events, success }
}
