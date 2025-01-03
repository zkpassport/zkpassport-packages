# zkpassport-sdk

## Installation

```
npm install @zkpassport/sdk
```

## How to use

```ts
import { ZkPassport } from '@zkpassport/sdk'

// Replace with your domain
const zkPassport = new ZkPassport('demo.zkpassport.id')

// Specify your app name, logo and the purpose of the request
// you'll send to your visitors or users
const queryBuilder = await zkPassport.request({
  name: 'ZKpassport',
  logo: 'https://zkpassport.id/logo.png',
  purpose: 'Proof of country and first name',
})

// Specify the data you want to disclose
// Then you can call the `done` method to get the url and the callbacks to follow the progress
// and get back the result along with the proof
const { url, requestId, onQRCodeScanned, onGeneratingProof, onProofGenerated, onReject, onError } = queryBuilder
  .disclose('nationality')
  .disclose('firstname')
  .done()

// Generate a url with the url and let your user scan it
// or transform it into a button if the user is on mobile

onQRCodeScanned(() => {
  // The user scanned the QR code or clicked the button
  // Essentially, this means the request popup is now opened
  // on the user phone
  console.log('QR code scanned')
})

onGeneratingProof(() => {
  // The user accepted the request and the proof is being generated
  console.log('Generating proof')
})

onProofGenerated((result: ProofResult) => {
  // The proof has been generated
  // You can retrieve the proof, the verification key and the result of your query
  // Note: the verify function will soon be added to the SDK so you can verify the proof
  // directly
  console.log('Proof', result.proof)
  console.log('Verification key', result.verificationKey)
  console.log('Query result', result.queryResult)
  console.log('firstname', result.queryResult.firstname.disclose.result)
  console.log('nationality', result.queryResult.nationality.disclose.result)
})
```

### Using with Next.js

You can integrate `@zkpassport/sdk` into a Next.js application by creating a backend API route and calling it from your frontend.

#### **Backend (API Route)**

**App Router:** `app/api/zkpassport/route.ts`

```typescript
import { NextResponse } from 'next/server'
import { ZkPassport } from '@zkpassport/sdk'

export async function GET() {
  const zkPassport = new ZkPassport('demo.zkpassport.id') // Replace with your domain
  const queryBuilder = await zkPassport.request({
    name: 'ZKpassport Demo',
    logo: 'https://via.placeholder.com/150',
    purpose: 'Verify user nationality and first name',
  })
  const { url } = queryBuilder.disclose('nationality').disclose('firstname').done()
  return NextResponse.json({ url })
}
```

#### **Frontend Example**

**App Router:** `app/page.tsx`

```tsx
'use client'
import { useEffect, useState } from 'react'

export default function Home() {
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/zkpassport')
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
