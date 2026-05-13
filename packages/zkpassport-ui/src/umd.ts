// IIFE entry. Bundled and exposed as `window.ZKPassportUI` for <script>-tag consumers.
// Contains only the vanilla API — React is not bundled here.
// Re-exports from `./vanilla` so the two entries can't drift.

export * from "./vanilla"
