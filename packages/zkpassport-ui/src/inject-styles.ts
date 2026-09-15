// One <style> tag per stylesheet key, deduped across mounts and kept in sync
// when a stale tag from another bundle copy (hot reload, multiple widget
// versions) is already on the page.
const injectedKeys = new Set<string>()

export function injectStylesheet(css: string, key: string): void {
  if (injectedKeys.has(key) || typeof document === "undefined") return
  const selector = `style[data-zkpassport-ui="${key}"]`
  const existing = document.querySelector(selector)
  if (existing) {
    if (existing.textContent !== css) {
      existing.textContent = css
    }
    injectedKeys.add(key)
    return
  }
  const style = document.createElement("style")
  style.setAttribute("data-zkpassport-ui", key)
  style.textContent = css
  document.head.appendChild(style)
  injectedKeys.add(key)
}
