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

function mountFromMarkup(element: HTMLElement): void {
  const container = document.createElement("span")
  const options = readButtonOptions(element, container)
  if (!options) {
    logger.error("data-policy-id is required", element)
    return
  }
  container.className = element.className
  if (element.id) container.id = element.id
  container.setAttribute(MOUNTED_ATTRIBUTE, "")
  element.replaceWith(container)
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
