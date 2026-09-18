// Inline, so the flow never waits on a request to draw itself.

const line = (body: string, width = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

/** Marks a step that is behind you. */
export const ICON_CHECK = line(`<polyline points="4 12.5 9.5 18 20 6.5"/>`, 3.2)

// The two endings, each a tinted disc around its mark. Both take their colour
// from the element, so the tint and the mark always agree.
const seal = (mark: string) =>
  `<svg viewBox="0 0 143 143" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="142.654" height="142.654" rx="71.3271" fill="currentColor" fill-opacity="0.21"/>${mark}</svg>`

export const ICON_SEAL_CHECK = seal(
  `<path d="M55.4083 92.0375L41.9243 78.5535L35.3018 85.176L55.4083 105.283L108.857 51.8335L102.235 45.2109L55.4083 92.0375Z" fill="currentColor"/>`,
)

export const ICON_SEAL_CROSS = seal(
  `<path d="M49 49L94 94M94 49L49 94" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>`,
)

/** Points back and up, the way the relying party's tab sits behind this one. */
export const ICON_ARROW_BACK = line(
  `<line x1="18" y1="18" x2="7" y2="7"/><polyline points="7 14.5 7 7 14.5 7"/>`,
)

export const ICON_COPY = line(
  `<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>`,
)

/** A corner arrow, the way the app marks a link that leaves the page. */
export const ICON_EXTERNAL = `<svg viewBox="0 0 15 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.2545 2.42188C11.7082 2.42188 12.0762 2.78985 12.0762 3.24363V10.6382C12.0762 11.092 11.7082 11.4599 11.2545 11.4599C10.8007 11.4599 10.4327 11.092 10.4327 10.6382V5.2275L3.82465 11.8356C3.50378 12.1564 2.98339 12.1564 2.66252 11.8356C2.34166 11.5147 2.34166 10.9943 2.66252 10.6734L9.27058 4.06538H3.8599C3.40613 4.06538 3.03815 3.6974 3.03815 3.24363C3.03815 2.78985 3.40613 2.42188 3.8599 2.42188H11.2545Z"/></svg>`

/** Rotated by `.zkp-flow-spinner`. */
export const ICON_SPINNER = line(
  `<circle cx="12" cy="12" r="9" opacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/>`,
  2.5,
)
