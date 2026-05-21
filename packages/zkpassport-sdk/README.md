# ZKPassport SDK

Privacy-preserving identity verification using passports and ID cards.

_⚠️ Warning ⚠️_

_This is experimental software that has not been audited yet. Use at your own risk._

## Installation

```
npm install @zkpassport/sdk
```

## How to use

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
  // The scope is optional and can be used to scope the unique identifier
  // of the request to a specific use case
  // By default, the request's unique identifier is scoped to your domain name only
  scope: "eu-adult-not-scandinavia",
})

// Specify the data you want to disclose
// Then you can call the `done` method to get the url and the callbacks to follow the progress
// and get back the result along with the proof
// The example below requests to disclose the firstname, prove the user is at least 18 years old,
// prove the user is from the EU but not from a Scandinavian country (note that Norway is not in the EU)
const {
  url,
  requestId,
  onRequestReceived,
  onGeneratingProof,
  onProofGenerated,
  onResult,
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
  // The user scanned the QR code or clicked the link to the request
  // Essentially, this means the request popup is now opened
  // on the user phone
  console.log("Request received")
})

onGeneratingProof(() => {
  // The user accepted the request and the proof is being generated
  console.log("Generating proof")
})

// You probably don't need to use this callback
// But if you want to get the proofs and verify them manually, it's here
onProofGenerated(({ proof, vkeyHash, version, name }: ProofResult) => {
  // One of the proofs has been generated
  // Here, you can retrieve the proof manually and verify it
  // But note that the verification of the proofs is handled
  // automatically by the SDK
  console.log("Proof generated", proof)
  console.log("Verification key hash", vkeyHash)
  console.log("Version", version)
  console.log("Name", name)
})

// That's the callback you're looking for
onResult(
  ({
    uniqueIdentifier,
    verified,
    result,
  }: {
    uniqueIdentifier: string
    verified: boolean
    result: QueryResult
  }) => {
    // All the proofs have been generated and the final result is available
    console.log("firstname", result.firstname.disclose.result)
    console.log("age over 18", result.age.gte.result)
    console.log("nationality in EU", result.nationality.in.result)
    console.log("nationality not from Scandinavia", result.nationality.out.result)
    // You can also retrieved what were the values originally requested
    console.log("age over", result.age.gte.expected)
    console.log("nationality in", result.nationality.in.expected)
    console.log("nationality not in", result.nationality.out.expected)
    // You can make sure the proof are valid by checking verified is set to true
    console.log("proofs are valid", verified)
    // You can also retrieve the unique identifier associated to this request
    // The assumption is that the unique identifier will be the same if coming
    // from the same ID for the same domain name and scope
    // So you can use it to identify if the user has already provided the proof
    // for this specific use case
    console.log("unique identifier", uniqueIdentifier)
  },
)
```

### Using a policy

The ZKPassport dashboard is an **optional convenience layer**. You can use the SDK fully self-served (passing `name`, `logo`, `purpose` directly to `request()`) without depending on the dashboard. If you'd rather manage verification parameters and branding in one place, register your domain on the dashboard and reference a **policy** by id.

A policy is an immutable, versioned bundle of query configuration belonging to your domain. Every `request()` call best-effort fetches your per-domain dashboard config (branding + policies). The fetch is cached for the lifetime of the `ZKPassport` instance, so it only hits the network once. If the dashboard is unreachable and you didn't request a policy, the failure is swallowed silently and the request still goes out with your self-serve fields.

Apply a policy by chaining `.policy('<id>')` on the builder returned by `request()`:

```ts
// Defaults: name/logo come from the dashboard branding for your domain,
// purpose/scope come from the policy.
const { url, onResult } = (await zkPassport.request()).policy("pol_xyz").done()

// Override branding per-request (white-label).
const { url, onResult } = (
  await zkPassport.request({ name: "My Brand", logo: "https://my.brand/logo.png" })
)
  .policy("pol_xyz")
  .done()
```

Rules:

- The policy locks the query, purpose and scope: `.gte()`, `.disclose()`, `.eq()` etc. throw if combined with `.policy()` (in either order), and per-request `purpose`/`scope` are ignored.
- `name`/`logo` default to the dashboard branding for your domain. Pass `name`/`logo` to `request()` to override them per-request (white-label).
- `scope` is fixed to `<policyId>:<version>`, so proofs from different policy versions stay filterable apart.
- The result includes a `policy` field (the policy id) for surfacing in your UI / logs.

### Using with Next.js

You can integrate `@zkpassport/sdk` into a Next.js application by creating a backend API route and calling it from your frontend.

#### **Backend (API Route)**

**App Router:** `app/api/zkpassport/route.ts`

```typescript
import { NextResponse } from "next/server"
import { ZKPassport } from "@zkpassport/sdk"

export async function GET() {
  const zkPassport = new ZKPassport("demo.zkpassport.id") // Replace with your domain
  const queryBuilder = await zkPassport.request({
    name: "ZKPassport Demo",
    logo: "https://via.placeholder.com/150",
    purpose: "Verify user nationality and first name",
  })
  const { url } = queryBuilder.disclose("nationality").disclose("firstname").done()
  return NextResponse.json({ url })
}
```

#### **Frontend Example**

**App Router:** `app/page.tsx`

```tsx
"use client"
import { useEffect, useState } from "react"

export default function Home() {
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/zkpassport")
      .then((res) => res.json())
      .then((data) => setVerificationUrl(data.url))
      .catch(console.error)
  }, [])

  return (
    <div>
      <h1>ZKPassport Demo</h1>
      {verificationUrl ? (
        <a href={verificationUrl} target="_blank" rel="noopener noreferrer">
          <button>Verify Identity</button>
        </a>
      ) : (
        <p>Loading...</p>
      )}
    </div>
  )
}
```

## Local installation

### Clone the repository

```sh
git clone https://github.com/zkpassport/zkpassport-sdk.git
cd zkpassport-sdk
```

### Install dependencies

```sh
bun install
```

### Run Tests

```sh
bun test
```

### Simulate Websocket Messages

Simulate mobile websocket messages: `bun run scripts/simulate.ts mobile`

Simulate frontend websocket messages: `bun run scripts/simulate.ts frontend`
