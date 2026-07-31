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
import { injectStylesheet } from "./inject-styles"
import { useCard, type CardState, type ProofStreamProgress } from "./use-card"
import { describeQuery, type QueryDescriptionItem } from "./query-description"
import type { ZKPassportQRCodeOptions } from "./types"
import type { LocalProofProgress, SavedEnrollment } from "@zkpassport/sdk"

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
    flow,
    url,
    qrSvg,
    query,
    serviceName,
    serviceLogo,
    retry,
    continueWithPhone,
    storageSupported,
    savedEnrollments,
    pendingSaveName,
    localProvingId,
    localProgress,
    proofProgress,
    rememberInBrowser,
    setRememberInBrowser,
    fallbackNotice,
    verifyLocally,
    saveEnrollment,
    declineEnrollment,
    removeSavedId,
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
  const displayBrowserVerification = options.display?.browserVerification ?? true
  const headerName = options.name ?? serviceName ?? options.domain ?? ""
  const headerIcon = options.logo ?? serviceLogo ?? ""
  const appJoined =
    state === "scanned" ||
    state === "generating" ||
    state === "local-proving" ||
    state === "save-offer" ||
    state === "success" ||
    state === "error"
  const hasFacematch = !!query?.facematch
  const overlayCaption = getOverlayCaption(state, localProgress)
  const canRestart = state === "waiting" || state === "scanned"
  // Only once the request URL exists (the toggle regenerates the QR)
  const showRememberCheckbox =
    displayBrowserVerification &&
    !!options.enableBrowserEnrollment &&
    storageSupported &&
    flow === "phone" &&
    state === "waiting"
  // With the intro screen disabled, the local-verify entry point moves to the QR screen
  const showInlineLocalVerify =
    options.display?.intro === false &&
    displayBrowserVerification &&
    savedEnrollments.length > 0 &&
    state === "waiting"
  const steps =
    flow === "browser"
      ? buildBrowserSteps(state, localProgress)
      : buildPhoneSteps(state, appJoined, hasFacematch, proofProgress)

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
          savedEnrollments={displayBrowserVerification ? savedEnrollments : []}
          onContinue={continueWithPhone}
          onVerifyLocally={verifyLocally}
          onRemoveSavedId={removeSavedId}
          localProvingId={localProvingId}
          notice={fallbackNotice}
        />
      ) : (
        <div className="zkp-screen">
          <QrSlot state={state} qrSvg={qrSvg} caption={overlayCaption} />

          {fallbackNotice && state === "waiting" ? (
            <p className="zkp-notice">{fallbackNotice}</p>
          ) : null}

          {showInlineLocalVerify ? (
            <button
              type="button"
              className="zkp-intro-continue zkp-local-verify-inline"
              onClick={() => verifyLocally(savedEnrollments[0].id)}
            >
              Verify with this browser
            </button>
          ) : null}

          {state === "waiting" && url ? (
            <a className="zkp-open-app" href={url}>
              Open in ZKPassport App
            </a>
          ) : null}

          {showRememberCheckbox ? (
            <label className="zkp-remember">
              <input
                type="checkbox"
                checked={rememberInBrowser}
                onChange={(event) =>
                  setRememberInBrowser((event.target as HTMLInputElement).checked)
                }
              />
              <span>
                Remember in this browser next time{" "}
                <span className="zkp-remember-hint">(encrypted, unlocked by your passkey)</span>
              </span>
            </label>
          ) : null}

          {state === "save-offer" ? (
            <div className="zkp-save-offer">
              <p className="zkp-save-offer-text">
                Save this ID to verify without your phone next time. It stays encrypted in this
                browser and only your passkey can unlock it.
              </p>
              {pendingSaveName ? (
                <div className="zkp-id-row zkp-id-row-static">
                  <span
                    className="zkp-id-shield"
                    dangerouslySetInnerHTML={{ __html: ICON_SHIELD }}
                  />
                  <span className="zkp-id-name">{pendingSaveName}</span>
                  <span className="zkp-id-meta">encrypted</span>
                </div>
              ) : null}
              <button
                type="button"
                className="zkp-intro-continue"
                title="Your browser will ask you to confirm with Face ID, fingerprint or PIN"
                onClick={saveEnrollment}
              >
                Save with passkey
              </button>
              <p className="zkp-save-offer-hint">
                Your can confirm with Face ID, fingerprint or PIN.
              </p>
              <button type="button" className="zkp-intro-link" onClick={declineEnrollment}>
                Not now
              </button>
            </div>
          ) : null}

          {displaySteps && steps.length > 0 && state !== "save-offer" ? (
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

          {displayAppLinks && flow === "phone" ? (
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
  savedEnrollments,
  onContinue,
  onVerifyLocally,
  onRemoveSavedId,
  localProvingId,
  notice,
}: {
  appName: string
  items: QueryDescriptionItem[]
  loading: boolean
  savedEnrollments: SavedEnrollment[]
  onContinue: () => void
  onVerifyLocally: (enrollmentId: string) => void
  onRemoveSavedId: (enrollmentId: string) => void
  localProvingId: string | null
  notice: string | null
}) {
  const hasSaved = savedEnrollments.length > 0

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

      {hasSaved ? (
        <>
          <div className="zkp-divider" />
          <div className="zkp-intro-saved">
            <div className="zkp-saved-heading">
              <p className="zkp-eyebrow">Saved in this browser</p>
              <p className="zkp-saved-hint">Encrypted. Only your passkey can unlock them.</p>
            </div>
            <div className="zkp-id-list">
              {savedEnrollments.map((enrollment) => {
                const proving = localProvingId === enrollment.id
                const disabled = localProvingId !== null
                return (
                  <div key={enrollment.id} className="zkp-id-row" data-proving={proving}>
                    <button
                      type="button"
                      className="zkp-id-main"
                      disabled={disabled}
                      onClick={() => onVerifyLocally(enrollment.id)}
                    >
                      <span
                        className="zkp-id-shield"
                        dangerouslySetInnerHTML={{ __html: ICON_SHIELD }}
                      />
                      <span className="zkp-id-name">{enrollment.maskedName ?? "Saved ID"}</span>
                    </button>
                    {proving ? <span className="zkp-id-wait" aria-hidden="true" /> : null}
                    {!proving ? (
                      <button
                        type="button"
                        className="zkp-id-remove"
                        aria-label={`Remove ${enrollment.maskedName ?? "saved ID"}`}
                        title="Remove"
                        disabled={disabled}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Remove ${enrollment.maskedName ?? "this saved ID"} from this browser? You'll need your phone to verify and save it again.`,
                            )
                          ) {
                            onRemoveSavedId(enrollment.id)
                          }
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {notice ? <p className="zkp-intro-notice">{notice}</p> : null}
            <button
              type="button"
              className="zkp-intro-secondary"
              disabled={localProvingId !== null}
              onClick={onContinue}
            >
              Use another ID
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="zkp-intro-question">
            <span
              className="zkp-chip-symbol"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: ICON_EPASSPORT_CHIP }}
            />
            <p className="zkp-intro-question-text">
              Do you have a passport or ID card with a chip?
            </p>
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
        </>
      )}

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

function getOverlayCaption(state: CardState, localProgress: LocalProofProgress | null): string {
  switch (state) {
    case "scanned":
      return "Approve the request on your phone"
    case "generating":
      return "Generating proof…"
    case "local-proving":
      return localProgress
        ? `Verifying in this browser (${localProgress.current}/${localProgress.total})…`
        : "Verifying in this browser…"
    case "save-offer":
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
): StepDef[] {
  const finished = state === "success" || state === "save-offer"
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
      label: "Scan this QR code with the ZKPassport app.",
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

function buildBrowserSteps(state: CardState, localProgress: LocalProofProgress | null): StepDef[] {
  const finished = state === "success" || state === "save-offer"
  const proving = state === "local-proving"
  return [
    {
      key: "unlock",
      label: "Unlock your saved ID with your passkey.",
      status:
        proving && !localProgress ? "current" : localProgress || finished ? "done" : "pending",
      icon: null,
    },
    {
      key: "generate",
      label: localProgress
        ? `Generate proof in this browser (${localProgress.current}/${localProgress.total}).`
        : "Generate proof in this browser.",
      status: proving && localProgress ? "current" : finished ? "done" : "pending",
      icon: null,
    },
    {
      key: "verify",
      label: "Verify the proof.",
      status: finished ? "done" : "pending",
      icon: null,
    },
  ]
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
  const showSpinner = state === "connecting" || state === "generating" || state === "local-proving"

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
          {state === "success" || state === "save-offer" ? (
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
