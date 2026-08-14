# ZKPassport SDK

Privacy-preserving identity verification using passports and ID cards.

_⚠️ Warning ⚠️_

_This is experimental software that has not been audited yet. Use at your own risk._

## Installation

```
npm install @zkpassport/sdk
```

## How to use

For a drop-in QR card or verify button that wraps all of this, see [`@zkpassport/ui`](https://www.npmjs.com/package/@zkpassport/ui).

```ts
import { ZKPassport, EU_COUNTRIES } from "@zkpassport/sdk"

// Replace with your domain
const zkPassport = new ZKPassport("demo.zkpassport.id")

// Specify your app name, logo and the purpose of the request
// you'll send to your visitors or users
const queryBuilder = await zkPassport.request({
  name: "ZKPassport",
  logo: "https://zkpassport.id/logo.png",
  purpose: "Prove you are an adult from the EU but not from Scandinavia",
  // Optional: ties the user's unique identifier to a use case;
  // by default it is tied to your domain only
  scope: "eu-adult-not-scandinavia",
})

// Build the query; done() returns the request URL and the progress callbacks.
// Here: disclose the first name, prove 18+, prove EU nationality but not Scandinavian
// (Norway is already excluded — it is not in the EU)
const {
  url,
  requestId,
  onRequestReceived,
  onGeneratingProof,
  onProofGenerated,
  onSuccess,
  onReject,
  onError,
} = queryBuilder
  .disclose("firstname")
  .gte("age", 18)
  .in("nationality", EU_COUNTRIES)
  .out("nationality", ["Sweden", "Denmark"])
  .done()

// Generate a QR Code with the url and let your user scan it
// or transform it into a button if the user is on their phone

onRequestReceived(() => {
  // The user scanned the QR code or opened the link; the request is now on their phone
  console.log("Request received")
})

onGeneratingProof(() => {
  // The user accepted the request and the proof is being generated
  console.log("Generating proof")
})

// You probably don't need to use this callback
// It reports the progress as the proofs are generated one by one;
// the full set arrives in onSuccess
onProofGenerated(({ proof, vkeyHash, version, name }) => {
  // One of the proofs has been generated
  console.log("Proof generated", proof)
  console.log("Verification key hash", vkeyHash)
  console.log("Version", version)
  console.log("Name", name)
})

// That's the callback you're looking for
onSuccess(({ proofs, result }) => {
  // All the proofs have been generated and the result is available
  console.log("firstname", result.firstname.disclose.result)
  console.log("age over 18", result.age.gte.result)
  console.log("nationality in EU", result.nationality.in.result)
  console.log("nationality not from Scandinavia", result.nationality.out.result)
  // You can also retrieve what were the values originally requested
  console.log("age over", result.age.gte.expected)
  console.log("nationality in", result.nationality.in.expected)
  console.log("nationality not in", result.nationality.out.expected)
  // The proofs are NOT verified at this point. A result checked in the browser
  // can be tampered with, so send the proofs and the result to your backend
  // and verify them there (see "Verifying the proofs" below)
  fetch("/api/register", { method: "POST", body: JSON.stringify({ proofs, result }) })
})
```

The deprecated `onResult` callback still verifies the proofs for you and returns a `verified` flag along with the `uniqueIdentifier`, but a flag delivered to the browser cannot be trusted. Use `onSuccess` and verify on your backend instead.

### Verifying the proofs

On your backend, recreate the original query so a tampered request cannot pass, then verify the proofs you received:

```ts
import { ZKPassport, EU_COUNTRIES } from "@zkpassport/sdk"

const zkPassport = new ZKPassport("demo.zkpassport.id")

const { query } = zkPassport
  .createQuery()
  .disclose("firstname")
  .gte("age", 18)
  .in("nationality", EU_COUNTRIES)
  .out("nationality", ["Sweden", "Denmark"])
  .done()

const { verified, uniqueIdentifier } = await zkPassport.verify({
  proofs,
  originalQuery: query,
  queryResult: result,
  scope: "eu-adult-not-scandinavia",
})
if (!verified) return { registered: false }

// The unique identifier stays the same for the same ID, domain and scope,
// so it can act as the account key: store it in your DB with a uniqueness
// constraint, and a duplicate means this person already has an account
await db.users.insert({ zkpassportId: uniqueIdentifier })
return { registered: true }
```

`verify()` checks the proofs locally and defers to the ZKPassport verifier API when the local result is not verified. Set `verifierMode` to `"local"` or `"api"` to force one.

### Using with Next.js

Request the proofs in the browser (with the "How to use" example above, or the drop-in card/button from `@zkpassport/ui`), then send them from `onSuccess` to an API route that verifies them:

```ts
onSuccess(async ({ proofs, result }) => {
  await fetch("/api/register", { method: "POST", body: JSON.stringify({ proofs, result }) })
})
```

**App Router:** `app/api/register/route.ts`

```typescript
import { NextResponse } from "next/server"
import { ZKPassport } from "@zkpassport/sdk"

const zkPassport = new ZKPassport("demo.zkpassport.id") // Replace with your domain

export async function POST(request: Request) {
  const { proofs, result } = await request.json()

  // Recreate the original query so a tampered request cannot pass
  const { query } = zkPassport.createQuery().gte("age", 18).done()

  const { verified, uniqueIdentifier } = await zkPassport.verify({
    proofs,
    originalQuery: query,
    queryResult: result,
    scope: "age-check",
  })
  if (!verified) return NextResponse.json({ registered: false })

  // Store uniqueIdentifier in your DB as the user's key
  return NextResponse.json({ registered: true })
}
```

## Working on the SDK

The SDK lives in the [zkpassport-packages](https://github.com/zkpassport/zkpassport-packages) monorepo:

```sh
git clone https://github.com/zkpassport/zkpassport-packages.git
cd zkpassport-packages
bun install
cd packages/zkpassport-sdk
bun test
```
