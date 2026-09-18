// Inline, so the flow never waits on a request to draw itself.

/** The tick the ZKPassport app shows when a verification is done. */
export const ICON_CHECK_CIRCLE = `<svg viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M46.8732 80.3031L33.3892 66.8191L26.7666 73.4416L46.8732 93.5482L100.322 40.0991L93.6997 33.4766L46.8732 80.3031Z" fill="currentColor"/><circle cx="63.5137" cy="63.5137" r="60.0137" stroke="currentColor" stroke-width="7"/></svg>`

const line = (body: string, width = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

export const ICON_CROSS = line(
  `<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>`,
  2.5,
)

export const ICON_ARROW_LEFT = line(
  `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
)

export const ICON_COPY = line(
  `<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>`,
)

export const ICON_EXTERNAL = line(
  `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
)

/** Rotated by `.zkp-flow-spinner`. */
export const ICON_SPINNER = line(
  `<circle cx="12" cy="12" r="9" opacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/>`,
  2.5,
)
