import type { Chain, Hex } from "viem"

import { ICON_SEAL_CHECK } from "../shared/icons"
import { Actions, AddressLink, Primary, TxLink } from "../shared/controls"

export type DoneOutcome =
  | { kind: "verified" }
  | { kind: "minted"; hash: Hex; recipient: `0x${string}`; chain: Chain }
  | { kind: "already-verified"; recipient: `0x${string}`; chain: Chain }

export function Done({ outcome, appName }: { outcome: DoneOutcome; appName: string }) {
  return (
    <div className="flow-body">
      <div className="flow-done">
        <div className="flow-seal" dangerouslySetInnerHTML={{ __html: ICON_SEAL_CHECK }} />
        <p className="flow-done-title">Verified</p>
        <Outcome outcome={outcome} appName={appName} />
      </div>
      <Actions>
        <Primary onClick={() => window.close()}>Return to {appName}</Primary>
      </Actions>
    </div>
  )
}

function Outcome({ outcome, appName }: { outcome: DoneOutcome; appName: string }) {
  if (outcome.kind === "verified") {
    return <p className="flow-done-sub">{appName} has everything it needs.</p>
  }
  if (outcome.kind === "already-verified") {
    return (
      <>
        <p className="flow-done-sub">Verification token already minted to</p>
        <AddressLink chain={outcome.chain} address={outcome.recipient} chip />
      </>
    )
  }
  return (
    <>
      <p className="flow-done-sub">Verification token minted to</p>
      <AddressLink chain={outcome.chain} address={outcome.recipient} chip />
      <TxLink chain={outcome.chain} hash={outcome.hash} label="Transaction" quiet />
    </>
  )
}
