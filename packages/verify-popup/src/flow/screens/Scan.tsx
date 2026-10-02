import type { ReactNode } from "react"

import { Scanning } from "./Scanning"
import { Heading, Main } from "./primitives"

/**
 * How far the phone has got, once it has picked the request up. While proving,
 * `done` counts the proofs the bridge has sent back and `total` is how many it
 * says there will be.
 */
export type ScanProgress =
  | { stage: "scanned" }
  | { stage: "proving"; done: number; total: number | null }

/** Folds one proof into the progress; anything before proving is left alone. */
export function withProof(
  progress: ScanProgress | null,
  proof: { total?: number },
): ScanProgress | null {
  if (progress?.stage !== "proving") return progress
  return { ...progress, done: progress.done + 1, total: proof.total ?? progress.total }
}

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
