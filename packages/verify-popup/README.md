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

## Verification links

`https://verify.zkpassport.id?vl=<link id>` runs the same card for a link created in the
ZKPassport dashboard. The page loads the request from the dashboard API and posts the proofs
back to it once the phone has answered. For a local API set
`VITE_DASHBOARD_API_URL=http://localhost:3001`.

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
In link mode it comes from the dashboard API, which owns the link.
The mobile app's origin trust for `verify.zkpassport.id`
(`ZKPASSPORT_TRUSTED_ORIGINS` in the app) depends on this invariant.
