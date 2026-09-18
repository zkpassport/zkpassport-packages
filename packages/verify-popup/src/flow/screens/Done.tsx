import type { Chain, Hex } from "viem"

import { ICON_SEAL_CHECK } from "./icons"
import { Actions, Address, AddressLink, Primary, TxLink } from "./primitives"

/** How the flow ended; "verified" is the outcome when nothing is minted. */
export type DoneOutcome =
  | { kind: "verified" }
  | { kind: "minted"; hash: Hex; recipient: `0x${string}`; chain: Chain }
  | { kind: "already-verified"; recipient: `0x${string}` }

export function Done({ outcome, appName }: { outcome: DoneOutcome; appName: string }) {
  return (
    <div className="zkp-flow-body">
      <div className="zkp-flow-done">
        <div className="zkp-flow-seal" dangerouslySetInnerHTML={{ __html: ICON_SEAL_CHECK }} />
        <p className="zkp-flow-done-title">Verified</p>
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
    return <p className="zkp-flow-done-sub">{appName} has everything it needs.</p>
  }
  if (outcome.kind === "already-verified") {
    return (
      <>
        <p className="zkp-flow-done-sub">Verification token already minted to</p>
        <Address value={outcome.recipient} chip />
      </>
    )
  }
  return (
    <>
      <p className="zkp-flow-done-sub">Verification token minted to</p>
      <AddressLink chain={outcome.chain} address={outcome.recipient} />
      <TxLink chain={outcome.chain} hash={outcome.hash} label="Transaction" quiet />
    </>
  )
}
