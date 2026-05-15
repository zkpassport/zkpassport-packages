# ZKPassport UI

Drop-in QR verification card for [ZKPassport](https://zkpassport.id). Renders the QR, owns the visual state machine (preparing → connecting → waiting → scanned → generating → success/error), and lets you wire a verification flow in one mount.

## Installation

```sh
npm install @zkpassport/ui @zkpassport/sdk
```

`@zkpassport/sdk` is a peer dependency. React is optional — pull it in if you use the `<QRCard>` component or `useZKPassportRequest` hook.

## Usage

```tsx
import { useState } from "react"
import { ZKPassport } from "@zkpassport/sdk"
import { QRCard, useZKPassportRequest } from "@zkpassport/ui"

function App() {
  // `useState` (not `useMemo`) so React keeps the same instance.
  const [sdk] = useState(() => new ZKPassport(window.location.hostname))

  const request = useZKPassportRequest(sdk, {
    service: {
      name: "QR Test App",
      logo: "https://zkpassport.id/favicon.png",
      purpose: "Verify you're over 18",
    },
    query: (b) => b.gte("age", 18),
  })

  return (
    <QRCard
      request={request}
      onSuccess={(r) => console.log(r)}
      onError={console.error}
    />
  )
}
```

The hook returns `null` while it builds the request — the card renders its body immediately and swaps the QR area's skeleton for the QR once `request` is non-null.

In Next.js App Router, mark the file with `"use client"` so the card renders on the client. The package's React entry is also marked `"use client"`, so importing from a server component yields a clear error.

## Sizing

The card is fluid within bounds: fills its container width up to `max-width: 350px` and refuses to shrink below `min-width: 280px`. Control placement and outer margins by sizing the parent.

## CSS

Styles are auto-injected as a `<style>` tag wrapped in `@layer zkpassport`, so host app styles in the default cascade always win. CSP-strict consumers can opt out of inline styles by importing the standalone bundle:

```ts
import "@zkpassport/ui/styles.css"
```

## License

Apache-2.0
