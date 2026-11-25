import { useEffect, useState } from "react"
import type { Chain, Hex } from "viem"

import { ICON_SEAL_CHECK } from "../shared/icons"
import { Actions, AddressLink, Primary, TxLink } from "../shared/controls"

export type DoneOutcome =
  | { kind: "verified" }
  | { kind: "minted"; hash: Hex; recipient: `0x${string}`; chain: Chain }
  | { kind: "already-verified"; recipient: `0x${string}`; chain: Chain; heldUntil: bigint }

const AUTO_CLOSE_SECONDS = 5

export function Done({
  outcome,
  appName,
  closable = true,
}: {
  outcome: DoneOutcome
  appName: string
  closable?: boolean
}) {
  // A page opened from a link, or by the user themselves, has no window to go back to, and the
  // browser will not close it, so it says so instead of offering a button that does nothing
  const canClose = closable && !!window.opener
  const closesItself = outcome.kind === "verified" && canClose
  const secondsLeft = useAutoClose(closesItself)
  return (
    <div className="flow-body">
      <div className="flow-done">
        <div className="flow-seal" dangerouslySetInnerHTML={{ __html: ICON_SEAL_CHECK }} />
        <p className="flow-done-title">
          {outcome.kind === "verified" ? "Verified" : "Credential added"}
        </p>
        <Outcome outcome={outcome} appName={appName} />
        <p className="flow-done-sub">Your ID never left your phone.</p>
      </div>
      <Actions>
        {canClose ? (
          <Primary onClick={() => window.close()}>Return to {appName}</Primary>
        ) : (
          <p className="flow-actions-note">You can close this page now.</p>
        )}
        {closesItself ? (
          <p className="flow-actions-note">
            Closing in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}
          </p>
        ) : null}
      </Actions>
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
        <p className="flow-done-sub">You already hold this credential at</p>
        <AddressLink chain={outcome.chain} address={outcome.recipient} chip />
        <p className="flow-done-sub">Valid until {formatDate(outcome.heldUntil)}</p>
      </>
    )
  }
  return (
    <>
      <p className="flow-done-sub">Your credential is at</p>
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
