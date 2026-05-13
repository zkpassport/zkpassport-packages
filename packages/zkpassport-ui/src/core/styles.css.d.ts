// tsup inlines `.css` imports as raw strings via `loader: { ".css": "text" }`
// (see tsup.config.ts). This ambient declaration teaches TypeScript the same.
declare const css: string
export default css
