# ZKPassport UI

Drop-in verification card and button for [ZKPassport](https://zkpassport.id). Mount once, get a verification flow with state transitions, retry, and result callbacks.

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
      onSuccess={async ({ proofs, result }) => {
        // Verify the proofs on your backend with @zkpassport/sdk's verify(),
        // e.g. as part of creating the user's account
        const res = await fetch("/api/register", {
          method: "POST",
          body: JSON.stringify({ proofs, result }),
        })
        // Returning false shows the card's error state instead of success
        return (await res.json()).registered === true
      }}
    />
  )
}
```

In Next.js App Router, the React entry is marked `"use client"`, so importing from a server component yields a clear error.

The button opens the hosted verification popup instead of showing a QR code:

```tsx
import { VerifyWithZKPassport } from "@zkpassport/ui/react"

<VerifyWithZKPassport
  purpose="Prove you are an adult from the EU"
  query={{ age: { min: 18 }, nationality: { included: ["EU"] } }}
  service={{ scope: "age-check" }}
  onSuccess={async ({ proofs, result }) => {
    const res = await fetch("/api/register", { method: "POST", body: JSON.stringify({ proofs, result }) })
    return (await res.json()).registered === true
  }}
/>
```

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
  onSuccess: async ({ proofs, result }) => {
    const res = await fetch("/api/register", { method: "POST", body: JSON.stringify({ proofs, result }) })
    return (await res.json()).registered === true
  },
})

// handle.update(nextOptions)  — swap options
// handle.retry()              — rebuild the request
// handle.unmount()            — tear it all down
```

The button takes the same options as the React component, and an element or a selector:

```ts
import { VerifyWithZKPassport } from "@zkpassport/ui"

const handle = VerifyWithZKPassport.render("#zkpassport", {
  purpose: "Prove you are an adult from the EU",
  query: { age: { min: 18 }, nationality: { included: ["EU"] } },
  service: { scope: "age-check" },
  onSuccess: async ({ proofs, result }) => {
    const res = await fetch("/api/register", { method: "POST", body: JSON.stringify({ proofs, result }) })
    return (await res.json()).registered === true
  },
})

// handle.update(nextOptions)  — swap options
// handle.unmount()            — tear it down
```

`@zkpassport/ui/button` (and `@zkpassport/ui/react-button`) export the same button without the
card's code, for a smaller bundle.


## Script tag

Without a bundler, load the button from a CDN. Put both scripts at the end of `<body>`, loader
first, so the element exists and the global is defined when `render` runs:

```html
<div id="zkpassport"></div>

<script src="https://cdn.zkpassport.id/ui/v1/ui.js"></script>
<script>
  VerifyWithZKPassport.render("#zkpassport", {
    purpose: "Prove you are an adult from the EU",
    query: { age: { min: 18 }, nationality: { included: ["EU"] } },
    service: { scope: "age-check" },
    onSuccess: async ({ proofs, result }) => {
      const res = await fetch("/api/register", { method: "POST", body: JSON.stringify({ proofs, result }) })
      return (await res.json()).registered === true
    },
    onError: (error) => {
      if (!error.cancelled) alert(error.message)
    },
  })
</script>
```

`v1` follows the latest release of the current API, 0.x included; a breaking change moves to `v2`. To pin a release instead, use
`https://cdn.zkpassport.id/ui/<version>/ui.js`. `render` returns a handle with `update(nextOptions)`
and `unmount()`.

## License

Apache-2.0
