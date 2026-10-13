import type { QueryBuilderResult, RequestSuccess } from "@zkpassport/sdk"
import type { Query } from "@zkpassport/utils"

export type TrackedRequest = {
  url: string
  query: Query
  events: string[]
  success: Promise<RequestSuccess>
}

/** Record a request's SDK callbacks as events, and its success or failure as a promise */
export function trackRequest(request: QueryBuilderResult): TrackedRequest {
  const events: string[] = []
  const success = new Promise<RequestSuccess>((resolve, reject) => {
    request.onRequestReceived(() => events.push("requestReceived"))
    request.onGeneratingProof(() => events.push("generatingProof"))
    request.onProofGenerated((proof) => events.push(`proof:${proof.name}`))
    request.onSuccess((response) => {
      events.push("success")
      resolve(response)
    })
    request.onReject(() => reject(new Error("onReject")))
    request.onError((error) => reject(new Error(`onError: ${error}`)))
  })
  return { url: request.url, query: request.query, events, success }
}
