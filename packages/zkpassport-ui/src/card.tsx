import { type ComponentChildren } from "preact"
import { useEffect, useLayoutEffect } from "preact/hooks"

import {
  APP_STORE_BADGE,
  APP_STORE_URL,
  GOOGLE_PLAY_BADGE,
  GOOGLE_PLAY_URL,
  ICON_CHECK,
  ICON_DOWNLOAD,
  ICON_ERROR,
  ICON_PHONE,
  ICON_REFRESH,
  ICON_SCAN,
  ICON_SHIELD,
  ICON_ZKP_MARK,
  SPINNER_SVG,
  ZKPASSPORT_DOWNLOAD_URL,
} from "./assets"
import cardStyles from "./styles.css"
import { useCard, type CardState } from "./use-card"
import type { ZKPassportQRCodeOptions } from "./types"

export type CardControl = { retry: () => void }

export type CardProps = {
  options: ZKPassportQRCodeOptions
  controlRef?: { current: CardControl | null }
}

export function Card({ options, controlRef }: CardProps) {
  // Layout effect, not effect — keeps icons from flashing at their default
  // SVG size before CSS rules apply.
  useLayoutEffect(injectStyles, [])

  const { state, url, qrSvg, retry } = useCard(options)

  useEffect(() => {
    if (!controlRef) return
    controlRef.current = { retry }
    return () => {
      controlRef.current = null
    }
  }, [retry, controlRef])

  const displayHeader = options.display?.header ?? true
  const displaySteps = options.display?.steps ?? true
  const displayAppLinks = options.display?.appLinks ?? true
  const headerName = options.name ?? options.domain ?? ""
  const headerIcon = options.logo ?? ""
  const appJoined =
    state === "scanned" || state === "generating" || state === "success" || state === "error"
  const stepStatuses = getStepStatuses(state)
  const overlayCaption = getOverlayCaption(state)
  const canRestart = state === "waiting" || state === "scanned"

  return (
    <div className="zkp-card" data-state={state} data-theme={options.theme ?? "auto"}>
      {canRestart ? (
        <button
          type="button"
          className="zkp-restart"
          aria-label="Restart verification"
          title="Restart verification"
          onClick={retry}
          dangerouslySetInnerHTML={{ __html: ICON_REFRESH }}
        />
      ) : null}
      {displayHeader ? (
        <>
          <div className="zkp-header">
            <div className="zkp-header-icons">
              <div className="zkp-zkp-icon" dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }} />
              {headerIcon ? (
                <>
                  <div className="zkp-header-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="zkp-app-icon-slot">
                    <img
                      className="zkp-app-icon"
                      src={headerIcon}
                      alt={headerName ? `${headerName} icon` : ""}
                    />
                  </div>
                </>
              ) : null}
            </div>
            <p className="zkp-title">
              <strong>{headerName || "This app"}</strong>
              {" uses "}
              <strong>ZKPassport</strong>
              {" to verify identity without compromising your privacy."}
            </p>
          </div>

          <div className="zkp-divider zkp-divider-header" />
        </>
      ) : null}

      <QrSlot state={state} qrSvg={qrSvg} caption={overlayCaption} />

      {state === "waiting" && url ? (
        <a className="zkp-open-app" href={url}>
          Open in ZKPassport App
        </a>
      ) : null}

      {displaySteps ? (
        <>
          <div className="zkp-divider zkp-divider-top" />

          <div className="zkp-steps">
            <ProgressStep status={stepStatuses[0]} icon={appJoined ? null : ICON_DOWNLOAD}>
              <a href={ZKPASSPORT_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
                Download
              </a>
              {" the ZKPassport mobile app."}
            </ProgressStep>
            <ProgressStep status={stepStatuses[1]} icon={appJoined ? null : ICON_SCAN}>
              Scan this QR code with the ZKPassport app.
            </ProgressStep>
            <ProgressStep status={stepStatuses[2]} icon={appJoined ? null : ICON_SHIELD}>
              Approve the request on your phone.
            </ProgressStep>
            <div className={`zkp-collapse${appJoined ? "" : " zkp-collapse-out"}`}>
              <>
                <ProgressStep status={stepStatuses[3]} icon={null}>
                  Generate proof on your device.
                </ProgressStep>
                <ProgressStep status={stepStatuses[4]} icon={null}>
                  Verify the proof.
                </ProgressStep>
              </>
            </div>
          </div>
        </>
      ) : null}

      {displayAppLinks ? (
        <div className={`zkp-collapse${appJoined ? " zkp-collapse-out" : ""}`}>
          <div className="zkp-collapse-inner">
            <div className="zkp-divider zkp-divider-bottom" />
            <div className="zkp-footer">
              <span className="zkp-footer-label">ZKPassport App</span>
              <div className="zkp-store-buttons">
                <StoreButton href={APP_STORE_URL} badge={APP_STORE_BADGE} />
                <StoreButton href={GOOGLE_PLAY_URL} badge={GOOGLE_PLAY_BADGE} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="zkp-result-actions">
          <button type="button" className="zkp-retry" onClick={retry}>
            Try again
          </button>
        </div>
      ) : null}
    </div>
  )
}

type StepStatus = "pending" | "current" | "done"

function getOverlayCaption(state: CardState): string {
  switch (state) {
    case "scanned":
      return "Approve the request on your phone"
    case "generating":
      return "Generating proof…"
    case "success":
      return "Verification complete"
    case "error":
      return "Something went wrong"
    default:
      return ""
  }
}

// Steps: [download, scan, approve, generate, verify]
function getStepStatuses(state: CardState): StepStatus[] {
  switch (state) {
    case "scanned":
      return ["done", "done", "current", "pending", "pending"]
    case "generating":
      return ["done", "done", "done", "current", "pending"]
    case "success":
      return ["done", "done", "done", "done", "done"]
    case "preparing":
    case "connecting":
    case "waiting":
    case "error":
    default:
      return ["pending", "pending", "pending", "pending", "pending"]
  }
}

function QrSlot({
  state,
  qrSvg,
  caption,
}: {
  state: CardState
  qrSvg: string | null
  caption: string
}) {
  const showSpinner = state === "connecting" || state === "generating"

  return (
    <div className="zkp-qr-slot" data-state={state}>
      <div className="zkp-skeleton" />
      <div className="zkp-qr" dangerouslySetInnerHTML={qrSvg ? { __html: qrSvg } : undefined} />
      {qrSvg ? (
        <div className="zkp-qr-logo" dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }} />
      ) : null}
      <div className="zkp-overlay">
        <div className="zkp-overlay-body">
          {showSpinner ? (
            <div className="zkp-spinner" dangerouslySetInnerHTML={{ __html: SPINNER_SVG }} />
          ) : null}
          {state === "scanned" ? (
            <div className="zkp-scanned-phone" dangerouslySetInnerHTML={{ __html: ICON_PHONE }} />
          ) : null}
          {state === "success" ? (
            <div className="zkp-check" dangerouslySetInnerHTML={{ __html: ICON_CHECK }} />
          ) : null}
          {state === "error" ? (
            <div className="zkp-error-icon" dangerouslySetInnerHTML={{ __html: ICON_ERROR }} />
          ) : null}
        </div>
        {caption ? (
          <div key={state} className="zkp-overlay-caption">
            {caption}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ProgressStep({
  status,
  icon,
  children,
}: {
  status: StepStatus
  icon: string | null
  children: ComponentChildren
}) {
  const mode = icon ? "icon" : "progress"
  return (
    <div className="zkp-step" data-status={status} data-mode={mode}>
      <div className="zkp-step-marker" dangerouslySetInnerHTML={{ __html: icon ?? ICON_CHECK }} />
      <div className="zkp-step-text">{children}</div>
    </div>
  )
}

function StoreButton({ href, badge }: { href: string; badge: { ariaLabel: string; svg: string } }) {
  return (
    <a
      className="zkp-store-button"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={badge.ariaLabel}
      dangerouslySetInnerHTML={{ __html: badge.svg }}
    />
  )
}

const INJECTED_ATTR = "data-zkpassport-ui"
let stylesInjected = false

function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return
  if (document.querySelector(`style[${INJECTED_ATTR}]`)) {
    stylesInjected = true
    return
  }
  const style = document.createElement("style")
  style.setAttribute(INJECTED_ATTR, "")
  style.textContent = cardStyles
  document.head.appendChild(style)
  stylesInjected = true
}
