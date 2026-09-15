/** @jsxImportSource react */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react"

import { ICON_CHECK, ICON_ZKP_MARK } from "../assets"
import buttonStyles from "../button.css"
import { injectStylesheet } from "../inject-styles"
import { createVerification, type VerificationState } from "../verification"
import {
  BUTTON_FONT_SIZES,
  buttonTooltip,
  DEFAULT_BUTTON_LABEL,
  errorMessage,
  isButtonDisabled,
  isErrorVisible,
  joinClasses,
  SUCCESS_BUTTON_LABEL,
  type VerifyWithZKPassportButtonOptions,
} from "../verify-button"

// Styles go in before the first paint in the browser; useLayoutEffect warns when server-rendered
const useStylesheet = typeof window === "undefined" ? useEffect : useLayoutEffect

export type ZKPassportVerification = VerificationState & {
  isLoading: boolean
  verify: () => void
}

export type VerifyWithZKPassportButtonProps = VerifyWithZKPassportButtonOptions & {
  // Render your own trigger instead of the branded button
  children?: (verification: ZKPassportVerification) => ReactNode
}

/** Button that opens the hosted verification popup. */
export function VerifyWithZKPassportButton({
  children,
  ...options
}: VerifyWithZKPassportButtonProps): ReactElement {
  const [state, setState] = useState<VerificationState>({ status: "idle", error: null })
  // Read at click time, so callers don't have to memoise their options or callbacks
  const latestOptions = useRef(options)
  latestOptions.current = options
  const [controller] = useState(() => createVerification(() => latestOptions.current, setState))
  useEffect(() => controller.close, [controller])

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
  options: VerifyWithZKPassportButtonOptions
  verification: ZKPassportVerification
}): ReactElement {
  useStylesheet(() => injectStylesheet(buttonStyles, "button"), [])
  const { status } = verification

  return (
    <div
      className={joinClasses("zkp-verify-wrap", options.classes?.root)}
      data-theme={options.theme ?? "light"}
      style={
        options.size
          ? ({ "--zkp-btn-font-size": BUTTON_FONT_SIZES[options.size] } as CSSProperties)
          : undefined
      }
    >
      <button
        type="button"
        className={joinClasses("zkp-verify-button", options.classes?.button)}
        data-status={status}
        disabled={isButtonDisabled(status)}
        title={buttonTooltip(status)}
        onClick={verification.verify}
      >
        <span className="zkp-verify-content">
          <span className="zkp-verify-state zkp-verify-state-default">
            <span
              className="zkp-verify-button-mark"
              dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }}
            />
            <span>{options.label ?? DEFAULT_BUTTON_LABEL}</span>
          </span>
          <span className="zkp-verify-state zkp-verify-state-success">
            <span
              className="zkp-verify-button-mark"
              dangerouslySetInnerHTML={{ __html: ICON_CHECK }}
            />
            <span>{SUCCESS_BUTTON_LABEL}</span>
          </span>
        </span>
      </button>
      {isErrorVisible(status, options) && (
        <p className={joinClasses("zkp-verify-error", options.classes?.error)} role="alert">
          {errorMessage(verification.error)}
        </p>
      )}
    </div>
  )
}

export type { VerifyButtonSize, VerifyWithZKPassportButtonOptions } from "../verify-button"
export type { VerificationOptions, VerificationState, VerificationStatus } from "../verification"
