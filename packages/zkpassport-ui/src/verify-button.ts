import type { VerificationOptions, VerificationStatus } from "./verification"

// A size is only a font size; the icon, gap and padding scale from it (see button.css)
export const BUTTON_FONT_SIZES = { small: "13px", medium: "15px", large: "18px" } as const

export type VerifyButtonSize = keyof typeof BUTTON_FONT_SIZES

export type VerifyWithZKPassportButtonOptions = VerificationOptions & {
  // Defaults to "light"; "auto" follows the operating system
  theme?: "light" | "dark" | "auto"
  // Defaults to "medium"; for anything in between, set --zkp-btn-font-size yourself
  size?: VerifyButtonSize
  label?: string
  // The error message is the only thing rendered outside the button; turn it off and use onError
  showErrorMessage?: boolean
  // Extra class names per element; prefer the --zkp-btn-* CSS custom properties
  classes?: {
    root?: string
    button?: string
    error?: string
  }
}

// Both states are always in the DOM so the button never changes size; see button.css
export const DEFAULT_BUTTON_LABEL = "Verify with ZKPassport"
export const SUCCESS_BUTTON_LABEL = "Verified"

export function isButtonDisabled(status: VerificationStatus): boolean {
  return status === "in-progress" || status === "success"
}

export function buttonTooltip(status: VerificationStatus): string {
  if (status === "in-progress") return "Verification is running in the ZKPassport window"
  if (status === "success") return "Verification complete"
  return "Opens a secure ZKPassport window"
}

export function isErrorVisible(
  status: VerificationStatus,
  options: VerifyWithZKPassportButtonOptions,
): boolean {
  return status === "error" && options.showErrorMessage !== false
}

export function errorMessage(error: string | null): string {
  return error ?? "Verification failed. Click to try again."
}

export function joinClasses(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base
}
