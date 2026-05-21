// tsup's `loader: { ".css": "text" }` inlines CSS imports as raw strings.
// This ambient declaration teaches TypeScript the same. Must live in a .d.ts
// (or a non-module .ts) — wildcard `declare module "*.css"` is rejected
// inside a module-file like card.tsx.
declare const css: string
export default css
