// Inline, so the flow never waits on a request to draw itself.

/** The gold tick the ZKPassport app shows when a verification is done. */
export const ICON_VERIFIED_MARK = `<svg viewBox="0 0 125 112" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M32.2241 60.2194L15.1348 49.9924L1.49288 64.6126L23.3583 100.75L40.378 110.343L122.94 24.2722L114.538 10.7075L98.2609 1.34375L35.8755 66.069L32.2241 60.2194Z" fill="#F9D59E"/><path d="M32.3105 60.0778L18.5078 74.3864L40.3459 110.342L122.947 24.2799L114.498 10.6523L46.1134 81.8975L32.3105 60.0778Z" fill="white"/><path d="M45.938 81.9913L36.0968 65.9982L98.2305 1.25391L114.647 10.5898L122.847 24.2027L40.2715 110.461L23.4295 100.847L1.25391 64.6367L15.2188 49.8984L32.4032 59.9957L45.938 81.9913L114.647 10.5898M1.25391 64.6367L18.5176 74.4609M32.4032 59.9957L18.5176 74.4609M18.5176 74.4609L40.2715 110.461" stroke="black" stroke-width="2"/></svg>`

const line = (body: string, width = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`

export const ICON_CROSS = line(
  `<line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/>`,
  2.5,
)

export const ICON_ARROW_LEFT = line(
  `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
)

export const ICON_SHIELD_CHECK = line(
  `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 11.5 11 13.5 15 9.5"/>`,
)

export const ICON_REFRESH = line(
  `<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>`,
)

export const ICON_SWAP = line(
  `<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>`,
)

export const ICON_WALLET = line(
  `<path d="M20 12V8H6a2 2 0 0 1 0-4h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>`,
)

export const ICON_EXTERNAL = line(
  `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`,
)

/** Rotated by `.zkp-flow-spinner`. */
export const ICON_SPINNER = line(
  `<circle cx="12" cy="12" r="9" opacity="0.3"/><path d="M21 12a9 9 0 0 0-9-9"/>`,
  2.5,
)
