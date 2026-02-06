# ZKPassport Monorepo

ZKPassport allows privacy-preserving identity verification using passports and ID cards. This monorepo contains the components of the ZKPassport project:

 - **Registry Contracts**: Smart contracts for the onchain registry
 - **Registry SDK**: JavaScript SDK for interacting with the registry
 - **Registry Explorer**: Web app for exploring and verifying registry certificates
 - **ZKPassport SDK**: SDK for integrating with ZKPassport
 - **ZKPassport Utils**: Shared utilities used across ZKPassport packages

## Project Structure

```
zkpassport-packages/
├── packages/
│   ├── registry-contracts/     # Registry smart contracts
│   ├── registry-sdk/           # Registry JS SDK for querying the registry
│   ├── registry-explorer/      # Registry Explorer web app for exploring the registry
│   ├── zkpassport-sdk/         # SDK for integrating with ZKPassport
│   └── zkpassport-utils/       # Shared utilities packages
```
