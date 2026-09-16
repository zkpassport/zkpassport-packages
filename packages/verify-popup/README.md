# verify-popup

The hosted verification page (`verify.zkpassport.id`). Opened as a popup by
`<VerifyWithZKPassport>` from `@zkpassport/ui`; renders the standard
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

## Configuration

- `VITE_RPC_URL_ETHEREUM_SEPOLIA`, `VITE_RPC_URL_ETHEREUM` — RPC endpoints the
  credential flow reads and simulates through (policy, credential balance,
  pre-flight, receipts). Unset means viem's public default for the chain, which
  is rate-limited; set them on the deployment host. `?rpc=` on the popup URL
  overrides the endpoint on localhost only.

The mint step offers browser extension wallets only (EIP-6963 discovery plus
the plain injected provider); WalletConnect is not wired in.

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

In credential mode the SDK domain (the `d=` in the request URL, and the domain
the proof is bound to) is the `ZKPassportCredentials` contract's on-chain
`domain()`, read from the contract, never the RP origin. The RP origin only
names the header when the RP sends no `name`.

Dev mode is two separate things, and the RP's option sets neither. The request is
rooted in ZKPassport's testnet registries when the credential's chain is a testnet,
because a deployment's verifier only accepts roots from its own registry set. The
`devMode` sent with `issue()` is the policy evaluator's own on-chain `devMode()`,
which decides only whether mock-document proofs are accepted; an evaluator that is
not in dev mode reverts any submission claiming it.
