import type { Chain } from "viem"

import type { DoneStep } from "../use-credential-flow"
import { explorerTxUrl } from "./format"
import { ICON_ARROW_LEFT, ICON_VERIFIED_MARK } from "./icons"
import { Actions, Address, CopyButton, Primary, TxLink } from "./primitives"

type DoneProps = {
  step: DoneStep
  recipient: `0x${string}`
  chain: Chain
  appName: string
}

export function Done({ step, recipient, chain, appName }: DoneProps) {
  return (
    <div className="zkp-flow-body">
      <div className="zkp-flow-done">
        <div className="zkp-flow-seal" dangerouslySetInnerHTML={{ __html: ICON_VERIFIED_MARK }} />
        {step.outcome === "minted" ? (
          <>
            <div className="zkp-flow-done-text">
              <p className="zkp-flow-done-title">Verification minted</p>
              <p className="zkp-flow-done-sub">
                Now in <Address value={recipient} /> on {chain.name}
              </p>
            </div>
            <div className="zkp-flow-receipt">
              <TxLink chain={chain} hash={step.hash} label="View transaction" />
              <CopyButton
                text={explorerTxUrl(chain, step.hash) ?? step.hash}
                label="Copy the link"
              />
            </div>
          </>
        ) : (
          <div className="zkp-flow-done-text">
            <p className="zkp-flow-done-title">You are all set</p>
            <p className="zkp-flow-done-sub">
              <Address value={recipient} /> is already verified
            </p>
          </div>
        )}
      </div>
      <Actions>
        <Primary icon={ICON_ARROW_LEFT} onClick={() => window.close()}>
          Back to {appName}
        </Primary>
      </Actions>
    </div>
  )
}
