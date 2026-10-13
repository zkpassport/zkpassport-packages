import type { QueryBuilderResult, RequestSuccess } from "@zkpassport/sdk"
import type { ProofResult, Query } from "@zkpassport/utils"

export type RequestEvent =
  | { type: "requestReceived" }
  | { type: "generatingProof" }
  | { type: "proofGenerated"; proof: ProofResult }
  | { type: "success"; response: RequestSuccess }

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
    request.onProofGenerated((proof) => events.push({ type: "proofGenerated", proof }))
    request.onSuccess((response) => {
      events.push({ type: "success", response })
      resolve()
    })
    request.onReject(() => reject(new Error("onReject")))
    request.onError((error) => reject(new Error(`onError: ${error}`)))
  })
  return { trackedRequest: new TrackedRequest(request.url, request.query, events), outcome }
}

export class TrackedRequest {
  constructor(
    readonly url: string,
    readonly query: Query,
    readonly events: RequestEvent[],
  ) {}

  /** The response of the success event the request ended with, if it ended in one */
  result(): RequestSuccess | undefined {
    const lastEvent = this.events.at(-1)
    return lastEvent?.type === "success" ? lastEvent.response : undefined
  }

  /** The proofs of the request's proofGenerated events, in order */
  generatedProofs(): ProofResult[] {
    return this.events
      .filter((event) => event.type === "proofGenerated")
      .map((event) => event.proof)
  }
}
