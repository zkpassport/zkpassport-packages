/** @jsxImportSource react */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from "react"

import { ICON_CHECK, ICON_ZKP_MARK } from "../assets"
import buttonStyles from "../button.css"
import { createOpenInBrowserPanel } from "../open-in-browser-panel"
import { createVerification, type VerificationState } from "../verification"
import {
  BUTTON_CAPTION,
  buttonTooltip,
  buttonLabel,
  isButtonDisabled,
  SUCCESS_BUTTON_LABEL,
  type VerifyWithZKPassportOptions,
} from "../verify-button"

// The stylesheet is part of the markup, so server-rendered HTML paints styled instead of
// flashing a bare button, its marks stretched to the page width, until hydration. React 19
// hoists a <style> with these props into <head> and renders it once per href; React 18 leaves
// it in place, which works just as well. Raw HTML: React 18 would entity-escape the selectors' ">".
const STYLE_TAG = { href: "zkpassport-ui-button", precedence: "zkpassport" }

export type ZKPassportVerification = VerificationState & {
  isLoading: boolean
  verify: () => void
}

export type VerifyWithZKPassportProps = VerifyWithZKPassportOptions & {
  // Render your own trigger instead of the branded button
  children?: (verification: ZKPassportVerification) => ReactNode
}

/** Button that opens the hosted verification popup. */
export function VerifyWithZKPassport({
  children,
  ...options
}: VerifyWithZKPassportProps): ReactElement {
  // Read at click time, so callers don't have to memoise their options or callbacks
  const latestOptions = useRef(options)
  latestOptions.current = options
  // Built before the state, because it may open with a verification left over from an earlier page
  const publish = useRef<(next: VerificationState) => void>(() => {})
  const [controller] = useState(() =>
    createVerification(
      () => latestOptions.current,
      (next) => publish.current(next),
    ),
  )
  const [state, setState] = useState<VerificationState>(controller.state)
  publish.current = setState
  useEffect(() => controller.dispose, [controller])

  const verification: ZKPassportVerification = {
    ...state,
    isLoading: state.status === "in-progress",
    verify: controller.verify,
  }
  if (children) return <>{children(verification)}</>
  return <BrandedButton options={options} verification={verification} />
}

function BrandedButton({
  options,
  verification,
}: {
  options: VerifyWithZKPassportOptions
  verification: ZKPassportVerification
}): ReactElement {
  const { status, error, errorKind, openInBrowserUrl, resumable } = verification
  const style = options.style ?? {}

  return (
    <div className="zkp-verify-wrap" data-variant={style.variant ?? "filled"}>
      <style {...STYLE_TAG} dangerouslySetInnerHTML={{ __html: buttonStyles }} />
      <button
        type="button"
        className="zkp-verify-button"
        data-status={status}
        disabled={isButtonDisabled(status)}
        title={buttonTooltip(status, resumable)}
        onClick={verification.verify}
      >
        <span className="zkp-verify-button-mark">
          <span data-state="default" dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }} />
          <span data-state="success" dangerouslySetInnerHTML={{ __html: ICON_CHECK }} />
        </span>
        <span className="zkp-verify-body">
          <span className="zkp-verify-content">
            <span className="zkp-verify-state" data-state="default">
              <span>{buttonLabel(style.label, resumable)}</span>
              {/* North-east arrow: the click opens the hosted ZKPassport window */}
              <span className="zkp-verify-external" aria-hidden="true">
                {"\u2197"}
              </span>
            </span>
            <span className="zkp-verify-state" data-state="success">
              <span>{SUCCESS_BUTTON_LABEL}</span>
            </span>
          </span>
          <span className="zkp-verify-caption">{BUTTON_CAPTION}</span>
        </span>
      </button>
      {openInBrowserUrl && error ? (
        <OpenInBrowserPanel url={openInBrowserUrl} />
      ) : errorKind === "blocked" ? (
        <p className="zkp-verify-notice" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

// Plain DOM, so the React button and the vanilla one show the same panel
function OpenInBrowserPanel({ url }: { url: string }): ReactElement {
  const slot = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!slot.current) return
    const panel = createOpenInBrowserPanel({ url })
    slot.current.append(panel)
    return () => panel.remove()
  }, [url])

  return <div ref={slot} />
}

export type { VerifyWithZKPassportOptions } from "../verify-button"
export type {
  ServiceConfig,
  VerificationOverrides,
  VerificationOptions,
  VerificationState,
  VerificationStatus,
} from "../verification"
