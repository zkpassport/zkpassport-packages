import { type ComponentChildren } from "preact"
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"

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
import { detectMobileOs, openRequestInApp, playStoreUrlWithReferrer } from "./app-link"
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
  const displayFrame = options.display?.frame ?? true
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
    <div
      className="zkp-card"
      data-state={state}
      data-theme={options.theme ?? "auto"}
      data-frame={displayFrame ? undefined : "none"}
    >
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
          purpose={options.purpose}
          loading={query === null}
          onContinue={continueWithPhone}
        />
      ) : (
        <div className="zkp-screen">
          {showOpenAppHero ? (
            <OpenAppHero
              requestUrl={state === "waiting" ? url : null}
              inAppBrowser={inAppBrowser}
              onRevealQr={() => setQrRevealed(true)}
            />
          ) : (
            <QrSlot state={state} qrSvg={qrSvg} caption={overlayCaption} />
          )}

          {state === "waiting" && url && mobile && qrRevealed ? (
            <OpenAppButton requestUrl={url} label="Open in ZKPassport App" />
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

          {displayAppLinks && !showOpenAppHero ? (
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

// One placeholder per requested-claims row
const SKELETON_ROWS = 2

function IntroNote({ item }: { item: QueryDescriptionItem }) {
  return (
    <li className="zkp-intro-note">
      <span className="zkp-intro-note-label">{item.note}</span>
      {item.rows ? (
        <dl className="zkp-intro-note-rows">
          {item.rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="zkp-intro-note-text">{item.title}</span>
      )}
      {item.detail ? <span className="zkp-intro-item-detail">{item.detail}</span> : null}
    </li>
  )
}

// The ICAO e-passport symbol printed on the cover of biometric passports
const ICON_EPASSPORT_CHIP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 32" fill="currentColor" aria-hidden="true"><circle cx="27.5033" cy="15.722" r="7.48372"/><path d="M55.1719 31.4604H0V17.3281H17.0845C17.857 22.3884 22.2278 26.265 27.504 26.265C32.7802 26.265 37.151 22.3884 37.9235 17.3281H55.1719V31.4604Z"/><path d="M55.1719 14.1192H37.9236C37.1511 9.05887 32.7803 5.18223 27.504 5.18223C22.2278 5.18223 17.857 9.05887 17.0845 14.1192H0V0H55.1719V14.1192Z"/></svg>`

function IntroSection({
  appName,
  items,
  purpose,
  loading,
  onContinue,
}: {
  appName: string
  items: QueryDescriptionItem[]
  purpose?: string
  loading: boolean
  onContinue: () => void
}) {
  return (
    <div className="zkp-intro">
      <div className="zkp-intro-request">
        <p className="zkp-eyebrow">{appName} wants to verify</p>
        {loading ? (
          <ul className="zkp-intro-list" role="status" aria-label="Loading request">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <li key={index}>
                <span className="zkp-intro-check zkp-skel-check" />
                <span className="zkp-intro-item">
                  <span className="zkp-intro-item-title zkp-skel-text">
                    <span className="zkp-skel-bar" style={{ width: "80%" }} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="zkp-intro-list">
            {items.map((item, index) =>
              item.note ? (
                <IntroNote key={index} item={item} />
              ) : (
                <li key={index}>
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
              ),
            )}
          </ul>
        )}
        {purpose && !loading ? (
          <p className="zkp-intro-purpose">
            <span className="zkp-intro-purpose-label">Purpose</span>
            {purpose}
          </p>
        ) : null}
      </div>

      <div className="zkp-intro-question">
        <span
          className="zkp-chip-symbol"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: ICON_EPASSPORT_CHIP }}
        />
        <p className="zkp-intro-question-text">Do you have a passport or ID with a chip?</p>
        <p className="zkp-intro-question-hint">
          Look for this symbol on your passport or ID card. Your phone reads the chip over NFC.
        </p>
        <button type="button" className="zkp-intro-continue" onClick={onContinue}>
          Continue
        </button>
      </div>

      <div className="zkp-intro-footer">
        <div className="zkp-divider" />
        <p className="zkp-intro-footer-note">Your ID data never leaves your device.</p>
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
      // Kept neutral: the card may not have verified anything. Final wording TBD.
      return "Request complete"
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

function OpenAppHero({
  requestUrl,
  inAppBrowser,
  onRevealQr,
}: {
  requestUrl: string | null
  inAppBrowser: boolean
  onRevealQr: () => void
}) {
  const [appDidNotOpen, setAppDidNotOpen] = useState(false)

  return (
    <div className="zkp-open-app-hero">
      {requestUrl ? (
        <OpenAppButton
          requestUrl={requestUrl}
          label="Open ZKPassport App"
          // An in-app browser swallows the custom scheme even when the app is installed, so a
          // probe there would always report a miss
          onOpened={inAppBrowser ? undefined : (opened) => setAppDidNotOpen(!opened)}
        />
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
      <button type="button" className="zkp-qr-reveal" onClick={onRevealQr}>
        Scan a QR code with another device instead
      </button>
      <InstallOptions requestUrl={requestUrl} promoted={appDidNotOpen} />
    </div>
  )
}

function OpenAppButton({
  requestUrl,
  label,
  onOpened,
}: {
  requestUrl: string
  label: string
  onOpened?: (opened: boolean) => void
}) {
  const stopProbe = useRef<(() => void) | null>(null)
  useEffect(() => () => stopProbe.current?.(), [])

  const openApp = () => {
    stopProbe.current?.()
    stopProbe.current = openRequestInApp(requestUrl, onOpened)
  }

  return (
    <button type="button" className="zkp-open-app zkp-open-app-block" onClick={openApp}>
      {label}
    </button>
  )
}

// Always on screen, so a probe that wrongly concludes the app is missing costs the user nothing
function InstallOptions({
  requestUrl,
  promoted,
}: {
  requestUrl: string | null
  promoted: boolean
}) {
  const os = detectMobileOs()

  return (
    <div className="zkp-install" data-promoted={promoted ? "" : undefined}>
      <p className="zkp-install-title">Don’t have the app yet?</p>
      <p className="zkp-install-note">
        Verification happens in the ZKPassport app: it reads the chip in your passport or ID card,
        and that data never leaves your phone. Free on iOS and Android.
      </p>
      <div className="zkp-store-buttons zkp-install-stores">
        {os !== "android" ? <StoreButton href={APP_STORE_URL} badge={APP_STORE_BADGE} /> : null}
        {os !== "ios" ? (
          <StoreButton href={playStoreUrlWithReferrer(requestUrl)} badge={GOOGLE_PLAY_BADGE} />
        ) : null}
      </div>
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
