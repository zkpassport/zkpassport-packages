import type { Chain } from "viem"
import { ICON_CHECK } from "@zkpassport/ui/hosted"

import type { DoneStep } from "../use-credential-flow"
import { shortHex } from "./format"
import { Primary, Rows, Status, Title, TxLink } from "./primitives"

type DoneProps = {
  step: DoneStep
  recipient: `0x${string}`
  chain: Chain
  appName: string
}

export function Done({ step, recipient, chain, appName }: DoneProps) {
  return (
    <div className="zkp-flow-body">
      <div className="zkp-check" dangerouslySetInnerHTML={{ __html: ICON_CHECK }} />
      {step.outcome === "minted" ? (
        <>
          <Title>Credential minted</Title>
          <Rows
            rows={[
              { label: "Wallet", value: recipient, stacked: true },
              { label: "Network", value: chain.name },
              { label: "Transaction", value: <TxLink chain={chain} hash={step.hash} /> },
            ]}
          />
        </>
      ) : (
        <Status>{shortHex(recipient)} already holds this credential. You're all set.</Status>
      )}
      <Primary onClick={() => window.close()}>Return to {appName}</Primary>
    </div>
  )
}
