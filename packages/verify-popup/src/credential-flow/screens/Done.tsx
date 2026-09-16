import type { Chain } from "viem"

import type { DoneStep } from "../use-credential-flow"
import { explorerTxUrl } from "./format"
import { ICON_ARROW_LEFT, ICON_VERIFIED_MARK } from "./icons"
import { Actions, AddressLink, CopyButton, Meta, Primary, Statement, TxLink } from "./primitives"

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
          <Statement>
            Credential minted to <AddressLink chain={chain} address={recipient} />
          </Statement>
          <Meta>
            <TxLink chain={chain} hash={step.hash} />
            <CopyButton text={explorerTxUrl(chain, step.hash) ?? step.hash} label="Copy link" />
          </Meta>
        </>
      ) : (
        <Statement>
          Credential already in <AddressLink chain={chain} address={recipient} />
        </Statement>
      )}
      <Actions>
        <Primary icon={ICON_ARROW_LEFT} onClick={() => window.close()}>
          Return to {appName}
        </Primary>
      </Actions>
    </div>
  )
}
