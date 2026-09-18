import { useState } from "react"
import type { PopupConfigureMessage } from "@zkpassport/sdk/popup"

import type { OutgoingEvent } from "../events"
import { VerificationCard } from "../verification-card"
import { FlowCard } from "./FlowCard"
import { useFlowPage } from "./use-flow-page"
import { Done } from "./screens/Done"
import { ScanStep, withProof, type ScanProgress } from "./screens/Scan"

type VerifyFlowProps = {
  request: PopupConfigureMessage["request"]
  query: PopupConfigureMessage["query"]
  // Hostname of the relying party page; the header falls back to it when no name is sent
  rpHost: string
  send: (message: OutgoingEvent) => void
}

/**
 * The flow for a plain identity check, with no token to mint. It shares the
 * credential flow's card, so both hosted flows look the same; with a single
 * step there is no progress bar to show.
 */
export function VerifyFlow({ request, query, rpHost, send }: VerifyFlowProps) {
  const [scan, setScan] = useState<ScanProgress | null>(null)
  const [verified, setVerified] = useState(false)
  const appName = request.name ?? rpHost
  useFlowPage()

  return (
    <FlowCard name={appName} logo={request.logo} stepKey={verified ? "done" : "verify"}>
      {verified ? (
        <Done outcome={{ kind: "verified" }} appName={appName} />
      ) : (
        <ScanStep progress={scan}>
          <VerificationCard
            config={{ domain: rpHost, request, query }}
            theme="light"
            display={{ header: false, frame: false, steps: false, appLinks: false }}
            onRequestReceived={() => {
              setScan({ name: "scanned" })
              send({ type: "request-received" })
            }}
            onGeneratingProof={() => {
              setScan({ name: "proving", done: 0, total: null })
              send({ type: "generating" })
            }}
            onProofGenerated={(proof) => {
              setScan((current) => withProof(current, proof))
              send({
                type: "proof-generated",
                index: proof.index,
                total: proof.total,
                name: proof.name,
              })
            }}
            onSuccess={({ proofs, result }) => {
              setVerified(true)
              send({ type: "success", proofs, result })
            }}
            // The card shows its own message and retry, so the flow only steps back
            onReject={() => {
              setScan(null)
              send({ type: "rejected" })
            }}
            onError={(message) => {
              setScan(null)
              send({ type: "error", message: String(message) })
            }}
          />
        </ScanStep>
      )}
    </FlowCard>
  )
}
