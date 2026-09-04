# verify-popup

The hosted verification page (`verify.zkpassport.id`). Opened as a popup by
`<VerifyWithZKPassportButton>` from `@zkpassport/ui`; renders the standard
verification card on the zkpassport origin so saved IDs work across all
relying parties.

## Development

```bash
bun run dev   # http://localhost:5173
```

Point the button at it with `popupUrl="http://localhost:5173"`.

## Deployment

Build with `bun run build` (static output in `dist/`). The host MUST send this
response header on the page and on every asset it loads (the `bb.js` workers
need it too), which `vercel.json` does for the Vercel deployment:

```
Document-Isolation-Policy: isolate-and-credentialless
```

It grants `crossOriginIsolated` (SharedArrayBuffer → multithreaded WASM proving)
without COOP, so the `window.opener` postMessage channel back to the relying
party survives. Chromium supports it; other browsers ignore the header and
proving falls back to single-threaded automatically.

Do NOT set `Cross-Origin-Opener-Policy: same-origin` here — it would sever the
opener relationship and break result delivery to the relying party.

## Security invariant

The RP's identity is derived exclusively from the browser-attested
`event.origin` of the `configure` postMessage — never from message payloads.
The mobile app's origin trust for `verify.zkpassport.id`
(`ZKPASSPORT_TRUSTED_ORIGINS` in the app) depends on this invariant.
