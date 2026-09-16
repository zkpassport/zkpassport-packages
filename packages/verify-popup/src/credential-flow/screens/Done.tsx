import type { Chain } from "viem"

import type { DoneStep } from "../use-credential-flow"
import { shortHex } from "./format"
import { ICON_ARROW_LEFT, ICON_VERIFIED_MARK } from "./icons"
import { Actions, Primary, Rows, Status, Title, TxLink } from "./primitives"

type DoneProps = {
  step: DoneStep
  recipient: `0x${string}`
  chain: Chain
  appName: string
}

export function Done({ step, recipient, chain, appName }: DoneProps) {
  return (
    <div className="zkp-flow-body">
      <div className="zkp-flow-seal" dangerouslySetInnerHTML={{ __html: ICON_VERIFIED_MARK }} />
      {step.outcome === "minted" ? (
        <>
          <Title>Credential added</Title>
          <Rows
            rows={[
              { label: "Wallet", value: shortHex(recipient) },
              { label: "Network", value: chain.name },
              { label: "Transaction", value: <TxLink chain={chain} hash={step.hash} /> },
            ]}
          />
        </>
      ) : (
        <Status>{shortHex(recipient)} already holds this credential. You're all set.</Status>
      )}
      <Actions>
        <Primary icon={ICON_ARROW_LEFT} onClick={() => window.close()}>
          Return to {appName}
        </Primary>
      </Actions>
    </div>
  )
}
