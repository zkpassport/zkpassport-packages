import { useLayoutEffect, useRef, useState } from "preact/hooks"
import { createOfflineQuery } from "@zkpassport/sdk/query"
import {
  openVerificationPopup,
  type PopupRequestConfig,
  type PopupResult,
  type VerificationPopupHandle,
} from "@zkpassport/sdk/popup"
import type { Query } from "@zkpassport/sdk"

import { ICON_ZKP_MARK } from "./assets"
import { logger } from "./logger"
import { injectStylesheet } from "./inject-styles"
import buttonStyles from "./button.css"
import type { ZKPassportQRCodeOptions } from "./types"

/**
 * Options for the hosted-popup verification button. The query uses the same
 * builder-function pattern as the QR card; the button runs it against an offline
 * builder to obtain a serializable Query for the popup.
 */
export type VerifyWithZKPassportButtonOptions = PopupRequestConfig & {
  domain?: string
  theme?: "light" | "dark" | "auto"
  // URL of the hosted verification page (override for local development)
  popupUrl?: string
  // Button label; defaults to "Verify with ZKPassport"
  label?: string
  policyId?: string
  query: ZKPassportQRCodeOptions["query"]
  /**
   * Extra class names merged onto the button's elements, for CSS frameworks
   * (e.g. Tailwind) or scoped styles. For simple restyling prefer the CSS
   * custom properties (--zkp-btn-bg, --zkp-btn-radius, …) documented in the
   * stylesheet — set them on the mount element or any ancestor.
   */
  classes?: {
    /** The wrapper around the button and its status line (.zkp-verify-wrap) */
    root?: string
    /** The button element itself (.zkp-verify-button) */
    button?: string
    /** The status line under the button (.zkp-verify-status) */
    status?: string
  }
  onRequestReceived?: () => void
  onGeneratingProof?: () => void
  onProofGenerated?: (progress: { index?: number; total?: number; name?: string }) => void
  onResult?: (result: Omit<PopupResult, "zkpassport" | "type">) => void
  onReject?: () => void
  onError?: (message: string) => void
  onClose?: () => void
}

export type VerifyButtonProps = {
  options: VerifyWithZKPassportButtonOptions
}

type ButtonStatus = "idle" | "in-progress" | "success" | "error"

export function VerifyButton({ options }: VerifyButtonProps) {
  useLayoutEffect(() => injectStylesheet(buttonStyles, "button"), [])
  const [status, setStatus] = useState<ButtonStatus>("idle")
  const [errorText, setErrorText] = useState<string | null>(null)
  const handleRef = useRef<VerificationPopupHandle | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options

  const onClick = () => {
    const current = optionsRef.current
    setErrorText(null)
    // Focus an already-open popup instead of reconfiguring a new one
    if (handleRef.current && !handleRef.current.popup.closed) {
      handleRef.current.popup.focus()
      return
    }

    // Serialize the query by running the user's builder against an offline builder
    // (standalone module: no ZKPassport class, no bridge — keeps the button small)
    let query: Query
    let queryPolicy: string | undefined
    try {
      const built = current.query(createOfflineQuery() as never) as unknown as {
        query: Query
        policy?: string
      }
      query = built.query
      queryPolicy = built.policy
    } catch (reason) {
      logger.error(reason)
      setStatus("error")
      current.onError?.("Failed to build the verification query")
      return
    }

    const {
      domain: _domain,
      theme: _theme,
      popupUrl,
      label: _label,
      policyId,
      query: _query,
      classes: _classes,
      onRequestReceived,
      onGeneratingProof,
      onProofGenerated,
      onResult,
      onReject,
      onError,
      onClose,
      ...request
    } = current

    const handle = openVerificationPopup({
      popupUrl,
      request,
      query,
      // .policy() on the builder and the policyId option are equivalent
      policyId: policyId ?? queryPolicy,
      callbacks: {
        onRequestReceived,
        onGeneratingProof,
        onProofGenerated,
        onResult: (result) => {
          setStatus(result.verified ? "success" : "error")
          onResult?.(result)
        },
        onReject: () => {
          setStatus("error")
          onReject?.()
        },
        onError,
        onClose: () => {
          // Popup closed before producing a result
          setStatus("error")
          onClose?.()
        },
      },
    })
    if (!handle) {
      // Both the popup and the new-tab retry were blocked
      setStatus("error")
      setErrorText("Popup blocked. Allow popups for this site and try again.")
      onError?.("Popup blocked")
      return
    }
    handleRef.current = handle
    setStatus("in-progress")
  }

  // The button itself never changes size or content: same label and logo in every
  // state. Progress shows as a spinner ring around the logo; outcomes show in the
  // always-reserved status line below.
  const statusText =
    status === "in-progress"
      ? "Continue in the ZKPassport popup"
      : status === "success"
        ? "\u2713 Verified with ZKPassport"
        : status === "error"
          ? (errorText ?? "Verification failed. Click to try again.")
          : "\u00A0"

  const cx = (base: string, extra?: string) => (extra ? `${base} ${extra}` : base)

  return (
    <div
      className={cx("zkp-verify-wrap", options.classes?.root)}
      data-theme={options.theme ?? "auto"}
    >
      <button
        type="button"
        className={cx("zkp-verify-button", options.classes?.button)}
        data-status={status}
        disabled={status === "in-progress" || status === "success"}
        title={
          status === "in-progress"
            ? "Verification is running in the ZKPassport window"
            : status === "success"
              ? "Verification complete"
              : "Opens a secure ZKPassport window"
        }
        onClick={onClick}
      >
        <span
          className="zkp-verify-button-mark"
          dangerouslySetInnerHTML={{ __html: ICON_ZKP_MARK }}
        />
        <span>{options.label ?? "Verify with ZKPassport"}</span>
      </button>
      {/* Always rendered so the layout never shifts between states */}
      <p
        className={cx(
          `zkp-verify-status${
            status === "error"
              ? " zkp-verify-status-error"
              : status === "success"
                ? " zkp-verify-status-success"
                : ""
          }`,
          options.classes?.status,
        )}
        role={status === "error" ? "alert" : undefined}
      >
        {statusText}
      </p>
    </div>
  )
}
