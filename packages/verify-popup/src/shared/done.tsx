import { useEffect, useState, type ReactNode } from "react"
import type { Chain, Hex } from "viem"

import { ICON_SEAL_CHECK } from "../shared/icons"
import { Actions, AddressLink, Primary, TxLink } from "../shared/controls"

export type DoneOutcome =
  | { kind: "verified" }
  | { kind: "minted"; hash: Hex; recipient: `0x${string}`; chain: Chain }
  | { kind: "already-verified"; recipient: `0x${string}`; chain: Chain; heldUntil: bigint }

const AUTO_CLOSE_SECONDS = 5

/** The end of a flow. `actions` replaces the "Return to" button; null shows no action. */
export function Done({
  outcome,
  appName,
  actions,
}: {
  outcome: DoneOutcome
  appName: string
  actions?: ReactNode
}) {
  const closesItself = outcome.kind === "verified" && !!window.opener
  const secondsLeft = useAutoClose(closesItself)
  return (
    <div className="flow-body">
      <div className="flow-done">
        <div className="flow-seal" dangerouslySetInnerHTML={{ __html: ICON_SEAL_CHECK }} />
        <p className="flow-done-title">Verified</p>
        <Outcome outcome={outcome} appName={appName} />
        {closesItself ? (
          <p className="flow-done-sub">
            This window closes in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}
          </p>
        ) : null}
      </div>
      {actions === undefined ? (
        <Actions>
          <Primary onClick={() => window.close()}>Return to {appName}</Primary>
        </Actions>
      ) : actions === null ? null : (
        <Actions>{actions}</Actions>
      )}
    </div>
  )
}

function useAutoClose(active: boolean): number {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLOSE_SECONDS)
  useEffect(() => {
    if (!active) return
    if (secondsLeft === 0) {
      window.close()
      return
    }
    const timer = window.setTimeout(() => setSecondsLeft(secondsLeft - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [active, secondsLeft])
  return secondsLeft
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
        <p className="flow-done-sub">Valid until {formatDate(outcome.heldUntil)}</p>
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

function formatDate(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}
