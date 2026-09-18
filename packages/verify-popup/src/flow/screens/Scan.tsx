import type { ReactNode } from "react"

import { Scanning } from "./Scanning"
import { Heading, Main } from "./primitives"

/** How far the phone has got, once it has picked the request up. */
export type ScanProgress = "scanned" | "proving"

// The QR card stays mounted while the phone works, because unmounting it would
// drop the bridge; it is only hidden behind the waiting screen.
export function ScanStep({
  progress,
  children,
}: {
  progress: ScanProgress | null
  children: ReactNode
}) {
  return (
    <>
      <div className="zkp-flow-body" data-hidden={progress ? "" : undefined}>
        <Main>
          <Heading title="Scan with your phone" />
          <div className="zkp-flow-card-slot">{children}</div>
        </Main>
      </div>
      {progress ? <Scanning progress={progress} /> : null}
    </>
  )
}
