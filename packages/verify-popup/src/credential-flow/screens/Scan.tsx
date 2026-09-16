import type { ReactNode } from "react"

import { Hint, Title } from "./primitives"

// Stays mounted while the phone works, because unmounting the card would drop
// the bridge; it is only hidden
export function Scan({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return (
    <div className="zkp-flow-body" data-hidden={hidden ? "" : undefined}>
      <div className="zkp-flow-heading">
        <Title>Scan with your phone</Title>
        <Hint>Point your camera at the code.</Hint>
      </div>
      <div className="zkp-flow-card-slot">{children}</div>
    </div>
  )
}
