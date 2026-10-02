import type { VerificationOptions, VerificationStatus } from "./verification"

// Longer labels are truncated: the button is one line at its 260px minimum
export const MAX_LABEL_LENGTH = 32

export type VerifyButtonVariant = "filled" | "outline"

/** Finer control than this is the --zkp-btn-* custom properties in button.css. */
export type VerifyButtonStyle = {
  variant?: VerifyButtonVariant
  label?: string
}

export type VerifyWithZKPassportOptions = VerificationOptions & {
  style?: VerifyButtonStyle
}

// Both states are always in the DOM so the button never changes size; see button.css
export const DEFAULT_BUTTON_LABEL = "Verify your identity"
export const SUCCESS_BUTTON_LABEL = "Verified"

export function buttonLabel(label: string | undefined): string {
  const text = label?.trim() || DEFAULT_BUTTON_LABEL
  return text.length > MAX_LABEL_LENGTH ? `${text.slice(0, MAX_LABEL_LENGTH - 1)}\u2026` : text
}

// Second line inside the button, carrying the ZKPassport name the label no
// longer does
export const BUTTON_CAPTION = "Private identity verification by ZKPassport"

export function isButtonDisabled(status: VerificationStatus): boolean {
  return status === "in-progress" || status === "success"
}

export function buttonTooltip(status: VerificationStatus): string {
  if (status === "in-progress") return "Verification is running in the ZKPassport window"
  if (status === "success") return "Verification complete"
  return "Opens a secure ZKPassport window"
}
