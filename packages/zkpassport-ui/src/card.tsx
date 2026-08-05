import { type ComponentChildren } from "preact"
import { useEffect, useLayoutEffect, useState } from "preact/hooks"

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
import { injectStylesheet } from "./inject-styles"
import { useCard, type CardState, type ProofStreamProgress } from "./use-card"
import { describeQuery, type QueryDescriptionItem } from "./query-description"
import { isInAppBrowser, isMobileLike } from "./environment"
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

  const {
    state,
    url,
    qrSvg,
    query,
    serviceName,
    serviceLogo,
    retry,
    continueWithPhone,
    proofProgress,
  } = useCard(options)

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
  const headerName = options.name ?? serviceName ?? options.domain ?? ""
  const headerIcon = options.logo ?? serviceLogo ?? ""
  const appJoined =
    state === "scanned" || state === "generating" || state === "success" || state === "error"
  const hasFacematch = !!query?.facematch
  const overlayCaption = getOverlayCaption(state)
  const canRestart = state === "waiting" || state === "scanned"
  // Phones can't scan their own screen: lead with the universal link into the
  // app; the QR stays behind a toggle for cross-device flows
  const [qrRevealed, setQrRevealed] = useState(false)
  const mobile = isMobileLike()
  const inAppBrowser = isInAppBrowser()
  const preQr = state === "preparing" || state === "connecting" || state === "waiting"
  const showOpenAppHero = mobile && preQr && !qrRevealed
  const steps = buildPhoneSteps(
    state,
    appJoined,
    hasFacematch,
    proofProgress,
    mobile && !qrRevealed,
  )

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

      {state === "intro" ? (
        <IntroSection
          appName={headerName || "This app"}
          items={describeQuery(query)}
          loading={query === null}
          onContinue={continueWithPhone}
        />
      ) : (
        <div className="zkp-screen">
          {showOpenAppHero ? (
            <div className="zkp-open-app-hero">
              {state === "waiting" && url ? (
                <a className="zkp-open-app zkp-open-app-block" href={url}>
                  Open ZKPassport App
                </a>
              ) : (
                <div className="zkp-open-app-loading" role="status" aria-label="Preparing request">
                  <span className="zkp-skel-row" style={{ width: "100%", height: "48px" }} />
                </div>
              )}
              {inAppBrowser ? (
                <p className="zkp-inapp-hint">
                  If nothing opens, open this page in Safari or Chrome and try again.
                </p>
              ) : null}
              <button type="button" className="zkp-qr-reveal" onClick={() => setQrRevealed(true)}>
                Scan a QR code with another device instead
              </button>
            </div>
          ) : (
            <QrSlot state={state} qrSvg={qrSvg} caption={overlayCaption} />
          )}

          {state === "waiting" && url && mobile && qrRevealed ? (
            <a className="zkp-open-app zkp-open-app-block" href={url}>
              Open in ZKPassport App
            </a>
          ) : null}

          {displaySteps && steps.length > 0 ? (
            <>
              <div className="zkp-divider zkp-divider-top" />

              <div className="zkp-steps">
                {steps.map((step) => (
                  <ProgressStep key={step.key} status={step.status} icon={step.icon}>
                    {step.label}
                  </ProgressStep>
                ))}
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
      )}
    </div>
  )
}

// The ICAO e-passport symbol printed on the cover of biometric passports:
// a rounded rectangle with a horizontal line broken by a solid circle
const ICON_EPASSPORT_CHIP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 36" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="1.6" y="1.6" width="48.8" height="32.8" rx="5"/><line x1="8.5" y1="18" x2="17" y2="18"/><line x1="35" y1="18" x2="43.5" y2="18"/><circle cx="26" cy="18" r="6.5" fill="currentColor" stroke="none"/></svg>`

function IntroSection({
  appName,
  items,
  loading,
  onContinue,
}: {
  appName: string
  items: QueryDescriptionItem[]
  loading: boolean
  onContinue: () => void
}) {
  return (
    <div className="zkp-intro">
      <div className="zkp-intro-request">
        <p className="zkp-eyebrow">{appName} wants to verify</p>
        {loading ? (
          <div className="zkp-skel-rows" role="status" aria-label="Loading request">
            <span className="zkp-skel-row" style={{ width: "68%" }} />
            <span className="zkp-skel-row zkp-skel-row-detail" style={{ width: "48%" }} />
            <span className="zkp-skel-row" style={{ width: "56%" }} />
            <span className="zkp-skel-row zkp-skel-row-detail" style={{ width: "48%" }} />
          </div>
        ) : (
          <ul className="zkp-intro-list">
            {items.map((item) => (
              <li key={item.title}>
                <span
                  className="zkp-intro-check"
                  dangerouslySetInnerHTML={{ __html: ICON_CHECK }}
                />
                <span className="zkp-intro-item">
                  <span className="zkp-intro-item-title">{item.title}</span>
                  {item.detail ? (
                    <span className="zkp-intro-item-detail">{item.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="zkp-intro-question">
        <span
          className="zkp-chip-symbol"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: ICON_EPASSPORT_CHIP }}
        />
        <p className="zkp-intro-question-text">Do you have a passport or ID card with a chip?</p>
        <p className="zkp-intro-question-hint">
          You can verify with a chip-enabled passport or ID without sharing your document. Your
          phone can read it over NFC.
          <br />
          Look for this symbol on the cover.
        </p>
        <button type="button" className="zkp-intro-continue" onClick={onContinue}>
          Continue
        </button>
      </div>

      <div className="zkp-intro-footer">
        <div className="zkp-divider" />
        <div className="zkp-privacy-strip" aria-label="Private, encrypted, on your device">
          <span>Private</span>
          <span className="zkp-privacy-dot" aria-hidden="true">
            ·
          </span>
          <span>Encrypted</span>
          <span className="zkp-privacy-dot" aria-hidden="true">
            ·
          </span>
          <span>On your device</span>
        </div>
        <p className="zkp-intro-footer-note">
          Neither {appName} nor ZKPassport ever sees any personal information beyond what you to
          share. Your raw passport data stays on your devices.
        </p>
      </div>
    </div>
  )
}

type StepStatus = "pending" | "current" | "done"
type StepDef = { key: string; label: ComponentChildren; status: StepStatus; icon: string | null }

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

function buildPhoneSteps(
  state: CardState,
  appJoined: boolean,
  hasFacematch: boolean,
  proofProgress: ProofStreamProgress,
  sameDevice: boolean,
): StepDef[] {
  const finished = state === "success"
  const generating = state === "generating"
  const { received, total } = proofProgress
  const allReceived = total !== null && received >= total
  const preJoinStatus: StepStatus = appJoined ? "done" : "pending"

  const steps: StepDef[] = [
    {
      key: "download",
      label: (
        <>
          <a href={ZKPASSPORT_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
            Download
          </a>
          {" the ZKPassport mobile app."}
        </>
      ),
      status: preJoinStatus,
      icon: appJoined ? null : ICON_DOWNLOAD,
    },
    {
      key: "scan",
      label: sameDevice
        ? "Tap “Open ZKPassport App” above."
        : "Scan this QR code with the ZKPassport app.",
      status: preJoinStatus,
      icon: appJoined ? null : ICON_SCAN,
    },
    {
      key: "approve",
      label: "Approve the request on your phone.",
      status: state === "scanned" ? "current" : generating || finished ? "done" : "pending",
      icon: appJoined ? null : ICON_SHIELD,
    },
  ]
  if (hasFacematch) {
    steps.push({
      key: "selfie",
      label: "Take a selfie to match your ID photo.",
      status:
        generating && received === 0
          ? "current"
          : (generating && received > 0) || finished
            ? "done"
            : "pending",
      icon: null,
    })
  }
  steps.push(
    {
      key: "generate",
      label:
        generating && total !== null
          ? `Generate proof on your device (${Math.min(received, total)}/${total}).`
          : "Generate proof on your device.",
      status:
        generating && !allReceived && (!hasFacematch || received > 0)
          ? "current"
          : (generating && allReceived) || finished
            ? "done"
            : "pending",
      icon: null,
    },
    {
      key: "verify",
      label: "Verify the proof.",
      status: generating && allReceived ? "current" : finished ? "done" : "pending",
      icon: null,
    },
  )
  // Pre-join, only the first three steps are shown (with icons); the on-device
  // steps appear once the phone joins
  return appJoined ? steps : steps.slice(0, 3)
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

export function injectStyles() {
  injectStylesheet(cardStyles, "card")
}
