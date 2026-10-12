# Mock passports

`@zkpassport/utils/mock-passports` builds the mock passports of the Zero Knowledge Republic (ZKR).
Their SODs are signed by ZKR DSCs, which chain to the two ZKR CSCAs held by the testnet certificate
registry. The passports come without photos.

| Name               | DSC                  | CSCA                 |
| ------------------ | -------------------- | -------------------- |
| `john`             | RSA 2048, SHA-256    | RSA 2048, SHA-256    |
| `jane`             | RSA 3072, SHA-384    | RSA 2048, SHA-256    |
| `jack`             | RSA 4096, SHA-512    | RSA 2048, SHA-256    |
| `misterSanctioned` | RSA 2048, SHA-256    | RSA 2048, SHA-256    |
| `mary`             | ECDSA P-256, SHA-256 | ECDSA P-256, SHA-256 |
| `paul`             | ECDSA P-384, SHA-384 | ECDSA P-256, SHA-256 |
| `stephanie`        | ECDSA P-521, SHA-512 | ECDSA P-256, SHA-256 |

A DSC's hash algorithm is the one its SODs are signed with; each CSCA signs its DSCs with SHA-256.

## Usage

```typescript
import { getMockPassports } from "@zkpassport/utils/mock-passports"

const { john, mary } = getMockPassports()
```

## Regenerating the SODs

`scripts/generate-mock-passports.ts` signs the SODs in `sods/` with
`@zkpassport/utils/passport-generator`. It needs the ZKR CSCA key pairs, in the format
`saveKeypairToFile` writes, in `scripts/zkr/keypairs`, which git ignores:

- `zkr-csca-rsa-2048-sha256.json`
- `zkr-csca-ecdsa-p256-sha256.json`

It reuses the DSC key pairs it finds in the same directory and saves new ones for those missing,
writes the CSCA and DSC certificates to `scripts/zkr`, and overwrites `sods/`:

```sh
cd packages/zkpassport-utils
bun scripts/generate-mock-passports.ts
```

To check a DSC against its CSCA:

```sh
openssl verify -check_ss_sig -partial_chain \
  -CAfile scripts/zkr/zkr-csca-rsa-2048-sha256.pem scripts/zkr/zkr-dsc-rsa-2048-sha256.pem
```

The DSCs get new validity dates and signatures each run, which changes the circuit inputs that
`tests/circuit-matcher.test.ts` pins for John and Mary.
