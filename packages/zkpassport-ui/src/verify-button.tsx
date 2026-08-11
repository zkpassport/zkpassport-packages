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
import { isInAppBrowser } from "./environment"
import buttonStyles from "./button.css"
import type { ZKPassportQRCodeOptions } from "./types"

export type VerifyWithZKPassportButtonOptions = PopupRequestConfig & {
  domain?: string
  theme?: "light" | "dark" | "auto"
  // URL of the hosted verification page (override for local development)
  popupUrl?: string
  // Button label; defaults to "Verify with ZKPassport"
  label?: string
  policyId?: string
  query: ZKPassportQRCodeOptions["query"]
  // Extra class names per element; prefer the --zkp-btn-* CSS custom properties
  classes?: {
    root?: string
    button?: string
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

    // Serialize via the offline builder; policyId option == .policy() on the builder
    let query: Query
    try {
      const builder = createOfflineQuery()
      if (current.policyId) {
        builder.policy(current.policyId)
      }
      const built = current.query(builder as never) as unknown as { query: Query }
      query = built.query
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

    // Functions can't cross postMessage: drop them so configure doesn't die on DataCloneError
    const dropped = Object.keys(request).filter(
      (key) => typeof (request as Record<string, unknown>)[key] === "function",
    )
    if (dropped.length > 0) {
      logger.warn(`ignoring non-serializable option(s): ${dropped.join(", ")}`)
      for (const key of dropped) delete (request as Record<string, unknown>)[key]
    }

    const handle = openVerificationPopup({
      popupUrl,
      request,
      query,
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
          setStatus("idle")
          onClose?.()
        },
      },
    })
    if (!handle) {
      // In-app browsers often block window.open entirely — steer to a real browser
      setStatus("error")
      setErrorText(
        isInAppBrowser()
          ? "Couldn't open the verification window here. Open this page in Safari or Chrome and try again."
          : "Popup blocked. Allow popups for this site and try again.",
      )
      onError?.("Popup blocked")
      return
    }
    handleRef.current = handle
    setStatus("in-progress")
  }

  // The button itself never changes size or content: same label and logo in every state.
  const statusText =
    status === "in-progress"
      ? "Continue in the ZKPassport window"
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
