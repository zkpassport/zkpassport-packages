# ZKPassport Registry Client

JavaScript SDK for interacting with the ZKPassport certificate and circuit registries.

## Installation

```bash
bun i @zkpassport/registry
```

## Usage

### Basic Usage

```typescript
import { RegistryClient } from "@zkpassport/registry"

// Initialize registry client
const client = new RegistryClient({ chainId: 11155111 })

// Get latest certificates root
const root = await client.getCertificatesRoot()
console.log(`Latest certificates root: ${root}`)

// Get latest certificates (for latest root)
const certs = await client.getCertificates()
console.log(`Got ${certs.length} certificates`)

// Get certificates for a specific root
const forRoot = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
const certsForRoot = await client.getCertificates(forRoot)
console.log(`Got ${certs.length} certificates for root ${forRoot}`)

// Validate certificates against a root
const valid = await client.validateCertificates(certsForRoot, forRoot)
console.log(`Certificates are ${valid ? "valid" : "invalid"}`)

// Get certificate registry historical roots
const historicalRoots = await client.getCertificateRegistryHistoricalRoots()
console.log(`Historical roots: ${historicalRoots}`)
```
