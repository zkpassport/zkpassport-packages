import type { ReactNode } from "react"
import { ICON_ZKP_MARK } from "@zkpassport/ui/hosted"

type FlowCardProps = {
  name: string
  logo?: string
  // Changes remount the step area, which replays its entrance animation
  stepKey: string
  children: ReactNode
}

// One box for the whole flow: the header stays put while the step below it changes.
// data-theme mirrors the QR card's default ("auto") so the embedded card matches.
export function FlowCard({ name, logo, stepKey, children }: FlowCardProps) {
  return (
    <div className="zkp-card" data-theme="auto">
      <div className="zkp-header">
        <div className="zkp-header-icons">
          <div className="zkp-zkp-icon" dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }} />
          {logo ? (
            <>
              <div className="zkp-header-dots">
                <span />
                <span />
                <span />
              </div>
              <div className="zkp-app-icon-slot">
                <img className="zkp-app-icon" src={logo} alt="" />
              </div>
            </>
          ) : null}
        </div>
        <p className="zkp-title">
          <strong>{name}</strong>
          {" uses "}
          <strong>ZKPassport</strong>
          {" to verify identity without compromising your privacy."}
        </p>
      </div>
      <div className="zkp-divider zkp-divider-header" />
      <div key={stepKey} className="zkp-flow-step">
        {children}
      </div>
    </div>
  )
}
