/** @jsxImportSource react */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"

import { ICON_CHECK, ICON_ZKP_MARK } from "../assets"
import buttonStyles from "../button.css"
import { injectStylesheet } from "../inject-styles"
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

// Styles go in before the first paint in the browser; useLayoutEffect warns when server-rendered
const useStylesheet = typeof window === "undefined" ? useEffect : useLayoutEffect

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
  const [state, setState] = useState<VerificationState>({
    status: "idle",
    error: null,
    errorKind: null,
    openInBrowserUrl: null,
  })
  // Read at click time, so callers don't have to memoise their options or callbacks
  const latestOptions = useRef(options)
  latestOptions.current = options
  const [controller] = useState(() => createVerification(() => latestOptions.current, setState))
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
  useStylesheet(() => injectStylesheet(buttonStyles, "button"), [])
  const { status, error, errorKind, openInBrowserUrl } = verification
  const style = options.style ?? {}

  return (
    <div className="zkp-verify-wrap" data-variant={style.variant ?? "filled"}>
      <button
        type="button"
        className="zkp-verify-button"
        data-status={status}
        disabled={isButtonDisabled(status)}
        title={buttonTooltip(status)}
        onClick={verification.verify}
      >
        <span className="zkp-verify-button-mark">
          <span data-state="default" dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }} />
          <span data-state="success" dangerouslySetInnerHTML={{ __html: ICON_CHECK }} />
        </span>
        <span className="zkp-verify-body">
          <span className="zkp-verify-content">
            <span className="zkp-verify-state" data-state="default">
              <span>{buttonLabel(style.label)}</span>
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
