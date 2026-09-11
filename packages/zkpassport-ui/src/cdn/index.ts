import { mountVerifyButton } from "../button/index"
import { logger } from "../logger"
import { createVerification } from "../verification"
import { readButtonOptions } from "./options"

const MOUNTED_ATTRIBUTE = "data-zkpassport-mounted"

export function scan(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>("[data-zkpassport]")) {
    if (element.hasAttribute(MOUNTED_ATTRIBUTE)) continue
    const options = readButtonOptions(element)
    if (!options) {
      logger.error("data-policy-id is required", element)
      continue
    }
    element.setAttribute(MOUNTED_ATTRIBUTE, "")
    mountVerifyButton(element, options)
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan())
  } else {
    scan()
  }
}

export { mountVerifyButton, createVerification }
