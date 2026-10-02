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


## License

Apache-2.0
