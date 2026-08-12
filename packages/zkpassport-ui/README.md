# ZKPassport UI

Drop-in QR verification card for [ZKPassport](https://zkpassport.id). Mount once, get a verification flow with state transitions, retry, and result callbacks.

## Installation

```sh
npm install @zkpassport/ui @zkpassport/sdk
```

## React

```tsx
import { ZKPassportQRCode } from "@zkpassport/ui/react"

export default function Page() {
  return (
    <ZKPassportQRCode
      name="Aztec"
      logo="https://aztec.com/logo.png"
      purpose="Prove you are an adult from the EU but not from Scandinavia"
      scope="age-check"
      query={(queryBuilder) => queryBuilder.gte("age", 18).done()}
      onResult={({ verified, result, uniqueIdentifier }) => {
        if (verified) console.log(result, uniqueIdentifier)
      }}
    />
  )
}
```

In Next.js App Router, the React entry is marked `"use client"`, so importing from a server component yields a clear error.

## Vanilla JS

Works the same in plain JS, Vue, Svelte, Solid, Astro, or any bundler-based stack:

```ts
import { mount } from "@zkpassport/ui"

const handle = mount(document.getElementById("zk-passport")!, {
  name: "Aztec",
  logo: "https://aztec.com/logo.png",
  purpose: "Prove you are an adult from the EU but not from Scandinavia",
  scope: "age-check",
  query: (queryBuilder) => queryBuilder.gte("age", 18).done(),
  onResult: ({ verified, result, uniqueIdentifier }) => {
    if (verified) console.log(result, uniqueIdentifier)
  },
})

// handle.update(nextOptions)  — swap options
// handle.retry()              — rebuild the request
// handle.unmount()            — tear it all down
```

## Verify button

Opens the verification flow in a popup on the ZKPassport origin, where saved IDs work across every relying party. Options are the card's, minus the QR-only ones, plus `label`, `theme` (`"light"` by default, `"auto"` to follow the OS), `classes`, `policyId` and `popupUrl`; progress and success show inside the button, and the only thing rendered outside it is the error message, which `showErrorMessage: false` turns off if you would rather report failures from `onError`; callbacks are the SDK's, plus `onClose` when the user closes the popup without a result.

```tsx
import { VerifyWithZKPassportButton } from "@zkpassport/ui/react-button"

<VerifyWithZKPassportButton name="Aztec" scope="age-check" query={…} onResult={…} />
```

```ts
import { mountVerifyButton } from "@zkpassport/ui/button"

const handle = mountVerifyButton(document.getElementById("verify")!, options)
```

For your own button, pass a function as `children`:

```tsx
<VerifyWithZKPassportButton name="Aztec" scope="age-check" query={…}>
  {({ verify, isLoading }) => (
    <button onClick={verify} disabled={isLoading}>
      {isLoading ? <Spinner /> : "Get verified"}
    </button>
  )}
</VerifyWithZKPassportButton>
```

To own the surrounding layout too, skip the component: `useVerifyWithZKPassport(options)` returns the same `{ verify, status, isLoading, error }`, and `createVerification(getOptions, onStateChange)` does the same outside React. `status` is `"idle" | "in-progress" | "success" | "error"`; `error` holds a message only when the user needs one, such as a blocked popup.

## Callbacks

All optional. The SDK lifecycle callbacks pass through verbatim — their signatures are derived from `@zkpassport/sdk`'s `QueryBuilderResult`, so any SDK change flows through here automatically.

| Callback | Source | When |
| --- | --- | --- |
| `onReady` | UI | QR is scannable (fires once per request) |
| `onRetryClicked` | UI | User clicked the retry button after an error |
| `onBridgeConnect` | SDK | Bridge connected to the mobile app |
| `onRequestReceived` | SDK | Mobile app received the request payload |
| `onGeneratingProof` | SDK | User approved; proof generation started |
| `onProofGenerated(proof)` | SDK | A single proof has been generated |
| `onResult(response)` | SDK | Final result with `{ verified, uniqueIdentifier, result, ... }` — check `response.verified` for pass/fail |
| `onReject` | SDK | User rejected on phone |
| `onError(message)` | SDK | An SDK-side error (`message: string`) |

> Internal failures (request build failed, the `query` callback threw, QR generation failed) are logged to the console and transition the card to the `error` visual state — they don't fire `onError`, which is reserved for SDK-emitted errors so its semantics match `@zkpassport/sdk` exactly.

## Props

Props are a 1:1 mirror of `sdk.request(...)`'s argument shape, plus:

- `domain?` — passed to `new ZKPassport(...)`. Defaults to `window.location.hostname`.
- `query` (required) — receives the SDK's `QueryBuilder`, applies gates and returns `queryBuilder.done()`.
- `display?` — toggle optional card sections (each defaults to shown):
  - `header` — the ZKPassport mark, app logo, and intro line.
  - `steps` — the numbered verification steps.
  - `appLinks` — the footer with the App Store / Google Play download links.
- Lifecycle callbacks (see table above).

So `name`, `logo`, `purpose`, `scope`, `mode`, `devMode`, `validity`, `uniqueIdentifierType`, `oprfKeyId` are all valid props with their SDK-derived types. New SDK request fields appear automatically on the next SDK bump.

Excluded from the public surface (still accepted by the SDK if you call it yourself):

- `projectID` — not consumed by the mobile app today
- `topicOverride`, `keyPairOverride`, `cloudProverUrl`, `bridgeUrl` — bridge plumbing for advanced/internal use

```tsx
<ZKPassportQRCode
  name="Aztec"
  logo="https://aztec.com/logo.png"
  purpose="Prove you are an adult"
  scope="age-check"
  devMode
  mode="full"
  validity={86_400}
  query={(queryBuilder) => queryBuilder.gte("age", 18).done()}
/>
```

## CSS

Styles auto-inject as a `<style>` tag wrapped in `@layer zkpassport`, so host app styles in the default cascade always win. CSP-strict consumers can opt out of inline styles by importing the standalone bundle:

```ts
import "@zkpassport/ui/styles.css"
```

The button reads CSS custom properties for light restyling — `--zkp-btn-bg`, `-fg`, `-border`, `-radius`, `-padding`, `-font`, `-font-size`, `-letter-spacing`, `-text-transform`, plus `--zkp-verify-success`, `-error` for the verified and failed states. Set them on the mount element or any ancestor.

To resize the button, set `--zkp-btn-font-size`; the icon, gap and padding are in `em`, so they scale with it. Use `--zkp-btn-padding` on top of that to make it chunkier or tighter than the default proportions.

## How it works

- **Rendering** uses [Preact](https://preactjs.com) (~3.5KB gzipped, bundled inline). React consumers don't drag Preact into their app tree — the card mounts into its own root inside a host `<div>`.
- **Two entry points**: `@zkpassport/ui` (vanilla `mount()`) and `@zkpassport/ui/react` (React component). Both call into the same Preact `<Card>`.
- **The button doesn't use Preact.** Its flow lives in `createVerification` (plain TypeScript), and each entry renders it natively: real React in `@zkpassport/ui/react-button`, plain DOM in `@zkpassport/ui/button`. That's what lets React consumers pass their own children.
- **State machine** lives in a `useCard` hook: builds the request via `sdk.request(...)`, subscribes to the SDK's bridge events (`onBridgeConnect`, `onRequestReceived`, `onGeneratingProof`, `onResult`, `onReject`, `onError`), and maps them to UI states (`preparing → connecting → waiting → scanned → generating → success | error`).
- **`query`** receives the SDK's `QueryBuilder`. Apply gates and return `queryBuilder.done()`. Other props (`name`, `logo`, `scope`, `devMode`, …) flow straight through to `sdk.request(...)`.
- **Retry** rebuilds the request from scratch (re-runs `sdk.request(...)` and the `query` callback); a cancellation token invalidates SDK event subscribers from the superseded request.
- **Assets** (icons, QR logo, App Store / Google Play badges) are inline SVG strings so the package works with any bundler — no SVG/file loader needed.
- **Bundle size**: ~65KB raw, ~23KB gzipped. Roughly half is the `qrcode` library; the rest is Preact runtime + our code + inline SVGs.

## License

Apache-2.0
