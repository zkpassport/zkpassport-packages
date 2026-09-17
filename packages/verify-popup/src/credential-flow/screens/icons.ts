// Inline, so the flow never waits on a request to draw itself.

/** The gold tick the ZKPassport app shows when a verification is done. */
export const ICON_VERIFIED_MARK = `<svg viewBox="0 0 125 112" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M32.2241 60.2194L15.1348 49.9924L1.49288 64.6126L23.3583 100.75L40.378 110.343L122.94 24.2722L114.538 10.7075L98.2609 1.34375L35.8755 66.069L32.2241 60.2194Z" fill="#F9D59E"/><path d="M32.3105 60.0778L18.5078 74.3864L40.3459 110.342L122.947 24.2799L114.498 10.6523L46.1134 81.8975L32.3105 60.0778Z" fill="white"/><path d="M45.938 81.9913L36.0968 65.9982L98.2305 1.25391L114.647 10.5898L122.847 24.2027L40.2715 110.461L23.4295 100.847L1.25391 64.6367L15.2188 49.8984L32.4032 59.9957L45.938 81.9913L114.647 10.5898M1.25391 64.6367L18.5176 74.4609M32.4032 59.9957L18.5176 74.4609M18.5176 74.4609L40.2715 110.461" stroke="black" stroke-width="2"/></svg>`

const line = (body: string, width = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

export const ICON_CROSS = line(
  `<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>`,
  2.5,
)

/** Marks a stage of the journey that is behind you. */
export const ICON_TICK = line(`<polyline points="4 12.5 9.5 18 20 6.5"/>`, 3.2)

export const ICON_ARROW_LEFT = line(
  `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
)

/** Sits inside the ring of dots while the phone works. */
export const ICON_ID_CARD = `<svg viewBox="0 0 48 36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1.6" y="1.6" width="44.8" height="32.8" rx="5.4"/><circle cx="16" cy="15" r="4.4"/><path d="M8.8 27.2c1.3-3.5 3.9-5.3 7.2-5.3s5.9 1.8 7.2 5.3"/><path d="M30 13.6h9M30 20h9"/></svg>`

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
