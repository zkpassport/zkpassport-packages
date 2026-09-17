import type { ReactNode } from "react"

import { Heading, Main } from "./primitives"

// Stays mounted while the phone works, because unmounting the card would drop
// the bridge; it is only hidden
export function Scan({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return (
    <div className="zkp-flow-body" data-hidden={hidden ? "" : undefined}>
      <Main>
        <Heading title="Scan with your phone" hint="Point your camera at the code." />
        <div className="zkp-flow-card-slot">{children}</div>
      </Main>
    </div>
  )
}
