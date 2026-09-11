import { mountVerifyButton } from "../button/index"
import { logger } from "../logger"
import { createVerification } from "../verification"
import { readButtonOptions } from "./options"

const MOUNTED_ATTRIBUTE = "data-zkpassport-mounted"

export function scan(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>(".zkpassport-button")) {
    if (!element.hasAttribute(MOUNTED_ATTRIBUTE)) mountFromMarkup(element)
  }
}

// A link is replaced by the button; any other element gets the button inside
function mountFromMarkup(element: HTMLElement): void {
  const isLink = element.tagName === "A"
  const container = isLink ? document.createElement("span") : element
  const options = readButtonOptions(element, container)
  if (!options) {
    logger.error("policy missing: set data-policy-id or ?policy= in the link", element)
    return
  }
  if (isLink) {
    container.className = element.className
    element.replaceWith(container)
  }
  container.setAttribute(MOUNTED_ATTRIBUTE, "")
  mountVerifyButton(container, options)
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => scan())
  } else {
    scan()
  }
}

export { mountVerifyButton, createVerification }
